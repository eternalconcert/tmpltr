import fs from 'fs';
import http from 'http';
import { extname } from 'path';
import {
  types,
  extractBlocksTemplate,
  replaceBlocks,
  replaceContext,
  replaceConditionals,
  getContentType,
  replaceModifications,
} from './utils.mjs';
import crypto from 'crypto';
import { env } from 'process';

if (env.SECRET_KEY === undefined || env.SECRET_KEY.length < 32) {
  throw new Error('SECRET_KEY is not set or too short, must be at least 32 characters long');
}

const algorithm = 'aes-256-gcm';
const key = crypto.createHash('sha256').update(env.SECRET_KEY).digest();

/** GCM: 12-byte IV (24 hex) + ciphertext hex + 16-byte auth tag (32 hex). */
const GCM_IV_BYTES = 12;
const GCM_IV_HEX_LEN = GCM_IV_BYTES * 2;
const GCM_TAG_BYTES = 16;
const GCM_TAG_HEX_LEN = GCM_TAG_BYTES * 2;

const encrypt = (text) => {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ciphertext.toString('hex') + authTag.toString('hex');
};

const decrypt = (text) => {
  if (typeof text !== 'string' || text.length < GCM_IV_HEX_LEN + GCM_TAG_HEX_LEN) {
    throw new Error('invalid session payload');
  }
  const iv = Buffer.from(text.slice(0, GCM_IV_HEX_LEN), 'hex');
  const authTag = Buffer.from(text.slice(-GCM_TAG_HEX_LEN), 'hex');
  const ciphertextHex = text.slice(GCM_IV_HEX_LEN, -GCM_TAG_HEX_LEN);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertextHex, 'hex', 'utf8') + decipher.final('utf8');
};

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    const value = rest.join('=');
    if (name) {
      cookies[name] = value ? decodeURIComponent(value) : '';
    }
  });

  return cookies;
}

function cookieSecureSuffix(request) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const https = request.socket?.encrypted === true || forwarded === 'https';
  return https ? '; Secure' : '';
}

export class App {
  constructor(host, port, templateDir) {
    this.host = host || 'localhost';
    this.port = port || 3000;
    this.templateDir = templateDir || 'templates';
    this.beforeRequestCallbacks = [];
    this.beforeResponseCallbacks = [];
    this.globals = {};
  }

  staticPath = '/static/';

  routes = {};

  statusPages = {};

  extractParams(template, actualPath) {
    const paramNames = [];
    const regexPath = template.replace(/<([^>]+)>/g, (_, key) => {
      paramNames.push(key);
      return '([^/]+)';
    });
    const regex = new RegExp('^' + regexPath + '/?$');
    const match = actualPath.match(regex);
    if (!match) return null;

    const values = match.slice(1);
    return paramNames.reduce((acc, key, i) => {
      acc[key] = values[i];
      return acc;
    }, {});
  }

  matchRoute(path) {
    for (const template in this.routes) {
      const paramNames = [];
      const regexPath = template.replace(/<([^>]+)>/g, (_, key) => {
        paramNames.push(key);
        return '([^/]+)';
      });
      const regex = new RegExp('^' + regexPath + '/?$');
      const match = path.match(regex);
      if (match) {
        const values = match.slice(1);
        const params = paramNames.reduce((acc, key, i) => {
          acc[key] = values[i];
          return acc;
        }, {});
        return { handler: this.routes[template], params };
      }
    }
    return null; // Kein Match gefunden
  }

  beforeRequest = (callback) => {
    this.beforeRequestCallbacks.push(callback);
  };

  beforeResponse = (callback) => {
    this.beforeResponseCallbacks.push(callback);
  }

  route = (routePath, callback) => {
    this.routes[routePath] = callback;
  }

  processRequest = async (request, response) => {
    let sessionData = {};
    const session = {
      getData: () => {
        return sessionData;
      },
      getValue: (key) => {
        return sessionData[key];
      },
      setValue: (key, value) => {
        sessionData[key] = value;
      },
      deleteValue: (key) => {
        delete sessionData[key];
      },
      clear: () => {
        sessionData = {};
      },
    };
    if ('tmpltr-session' in parseCookies(request)) {
      try {
        const raw = parseCookies(request)['tmpltr-session'];
        const parsed = JSON.parse(decrypt(raw));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([key, value]) => {
            session.setValue(key, value);
          });
        }
      } catch {
        // Wrong IV (old server), tampered cookie, or legacy format — start fresh.
      }
    }
    request.session = session;

    const self = this;
    const responseContext = {
      status: undefined,
      contentType: types.html,
      headers: {},
      body: null,

      setStatus(code) {
        this.status = code;
        return this;
      },

      addHeader(key, value) {
        this.headers[key] = value;
        return this;
      },

      setContentType(type) {
        this.contentType = type;
        return this;
      },

      send404(context = {}) {
        let content = '404 - File not found';
        if (self.statusPages[404]) {
          content = this.renderTemplate(self.statusPages[404], context);
        }
        this.setStatus(404);
        return content;
      },

      sendFileFromDir(path) {
        let contentType = '';
        let statusCode = '';
        let responseContent = '';

        try {
          const decodedPath = decodeURIComponent(path);
          const fileContent = fs.readFileSync(decodedPath);
          const extension = extname(decodedPath).slice(1);
          contentType = extension ? getContentType(extension) : types.html;
          statusCode = 200;
          responseContent = fileContent;
        } catch (err) {
          contentType = types.plain;
          statusCode = 404;
          responseContent = 'File not found';
        }
        this.setStatus(statusCode);
        this.setContentType(contentType);
        return responseContent;
      },

      redirect(url, status = 302) {
        this.setStatus(status);
        this.addHeader('Location', url);
        return '';
      },

    };

    this.beforeRequestCallbacks.forEach(async callback => await callback(request, response));

    const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
    let pathname = parsedUrl.pathname;

    if (!pathname.endsWith('/') && !pathname.startsWith(this.staticPath)) {
      pathname = `${pathname}/`;
    }

    request.searchParams = parsedUrl.searchParams;

    let responseContent = '';
    let statusCode = 0;
    let contentType = types.plain;
    const matchedRoute = this.matchRoute(pathname);
    if (pathname.startsWith(this.staticPath)) {
      const fileName = pathname.replace(this.staticPath, '');
      try {
        const fileContent = fs.readFileSync(process.cwd() + this.staticPath + fileName);
        const extension = extname(pathname).slice(1);
        contentType = extension ? getContentType(extension) : types.html;
        responseContext.setContentType(contentType);
        statusCode = 200;
        responseContent = fileContent;
      } catch {
        contentType = types.plain;
        statusCode = 404;
        responseContent = 'File not found';
      }
    } else if (!matchedRoute) {
      statusCode = 404;
      if (this.statusPages[404]) {
        responseContent = this.renderTemplate(this.statusPages[404], { slug: pathname })[0];
        contentType = types.html;
      } else {
        responseContent = 'File not found';
      }
    }

    if (request.method === 'POST') {
      await new Promise((resolve) => {
        let chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
          const contentType = request.headers['content-type'] || '';
          const bodyBuffer = Buffer.concat(chunks);

          // 1. x-www-form-urlencoded
          if (contentType.startsWith('application/x-www-form-urlencoded')) {
            const body = bodyBuffer.toString();
            request.form = new URLSearchParams(body);
            request.files = {};
            return resolve();
          }

          // 2. multipart/form-data
          if (contentType.startsWith('multipart/form-data')) {
            const boundaryMatch = contentType.match(/boundary=(.+)$/);
            if (!boundaryMatch) {
              request.form = {};
              request.files = {};
              return resolve();
            }

            const boundary = '--' + boundaryMatch[1];
            const body = bodyBuffer.toString('binary');
            const parts = body.split(boundary).slice(1, -1);

            request.form = {};
            request.files = {};

            for (const part of parts) {
              const [rawHeaders, ...rest] = part.split('\r\n\r\n');
              if (!rawHeaders || rest.length === 0) continue;

              const partBodyRaw = rest.join('\r\n\r\n').replace(/\r\n$/, '');
              const partBodyBuffer = Buffer.from(partBodyRaw, 'binary');

              const nameMatch = rawHeaders.match(/name="([^"]+)"/);
              const filenameMatch = rawHeaders.match(/filename="([^"]+)"/);
              const name = nameMatch && nameMatch[1];

              if (!name) continue;

              if (filenameMatch && filenameMatch[1]) {
                const filename = filenameMatch[1];
                const contentTypeMatch = rawHeaders.match(/Content-Type: ([^\r\n]+)/);
                const fileContentType = contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream';

                request.files[name] = {
                  filename,
                  contentType: fileContentType,
                  data: partBodyBuffer
                };
              } else {
                request.form[name] = partBodyBuffer.toString('utf-8').trim();
              }
            }
            return resolve();
          }

          // Fallback
          request.form = {};
          request.files = {};
          resolve();
        });
      });
    }

    // Falls es eine Route gibt, sie ausführen (request.form ist jetzt verfügbar!)
    if (!statusCode && matchedRoute) {
      const result = await matchedRoute.handler(request, responseContext, matchedRoute.params);
      responseContent = result;
      statusCode = responseContext.status ? responseContext.status : 200;

      // Setze zusätzliche Header (z.B. für Redirect)
      for (const [key, value] of Object.entries(responseContext.headers)) {
        response.setHeader(key, value);
      }
    }
    response.setHeader("Server", 'TMPLTR');
    response.setHeader("Content-Length", Buffer.byteLength(responseContent));
    response.setHeader("Content-Type", responseContext.contentType || "text/html");

    Object.entries(responseContext.headers).forEach((item) => response.setHeader(item[0], item[1]));

    const secure = cookieSecureSuffix(request);
    const sessionMaxAge = 60 * 60 * 24 * 7;

    const cookies = [];

    cookies.push(`tmpltr-session=${encrypt(JSON.stringify(request.session.getData()))}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${sessionMaxAge}`);
    response.setHeader('Set-Cookie', cookies);

    this.beforeResponseCallbacks.forEach(async callback => await callback(request, response));
    if (response.statusCode === 200 && statusCode !== 200) {
      response.writeHead(statusCode);
    }
    if (typeof responseContent !== 'string' && !Buffer.isBuffer(responseContent)) {
      responseContent = String(responseContent ?? '');
    }
    response.end(responseContent);
    return;
  }

  requestListener = async (request, response) => {
    try {
      await this.processRequest(request, response);
    } catch (err) {
      console.error('Error:', err);
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Internal Server Error');
      return;
    }
  }

  renderTemplate = (fileName, context = {}, modifications, _request, _response) => {
    context.globals = this.globals;
    const regexExtends = /{% extends\s+([^\s]+)\s*%}/;
    let content = fs.readFileSync(`${this.templateDir}/${fileName}`, 'utf-8');

    let base = '';
    let blocks = {};

    const match = content.match(regexExtends);
    if (match && match[1]) {
      // Child-Template: Blöcke extrahieren und in Base einsetzen
      blocks = extractBlocksTemplate(content);
      base = fs.readFileSync(`${this.templateDir}/${match[1]}`, 'utf-8');
      content = replaceBlocks(base, blocks);
    } else {
      // Kein extends: Blöcke direkt extrahieren
      content = content;
    }

    content = replaceConditionals(content, context);

    if (context) {
      content = replaceContext(content, context);
    }

    if (modifications) {
      content = replaceModifications(content, modifications);
    }

    return content;
  }

  server = http.createServer(this.requestListener)

  serve() {
        this.server.listen(this.port, this.host, () => {
      console.log(`Server running at http://${this.host}:${this.port}/`);
    });
  }
}
