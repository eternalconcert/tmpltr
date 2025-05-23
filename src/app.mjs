import fs from 'fs';
import http from 'http';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  types,
  extractBlocksTemplate,
  replaceBlocks,
  replaceContext,
  replaceConditionals,
  getContentType,
  replaceModifications,
} from './utils.mjs';

// const isProduction = process.env.NODE_ENV === 'production'; <- secure cookie stuff

const getClientKeyFromClientSession = (request) => {
  return parseCookies(request)['tmpltr-session'] || '';
}

const getCookieConsent = (request) => {
  if (request.consent === 'false') {
    return false;
  }
  return parseCookies(request)['cookie-consent'] === 'true' || request.consent === 'true' || false;
}

class Session {
  #data = {};

  setValue(key, value, request) {
    const clientKey = request.clientKey;
    if (!this.#data[clientKey]) {
      this.#data[clientKey] = {};
    }
    this.#data[clientKey][key] = value;
  }

  getValue(key, request) {
    const clientKey = request.clientKey;
    return this.#data[clientKey]?.[key];
  }
}

function createProtectedSession() {
  const session = new Session();

  return new Proxy(session, {
    set(_target, prop, _value) {
      throw new Error(`Direktes Setzen von Property '${String(prop)}' ist nicht erlaubt. Benutze setValue().`);
    },
    get(target, prop) {
      if (prop === 'setValue' || prop === 'getValue') {
        return target[prop].bind(target);
      }
      if (typeof prop === 'string' && !(prop in target)) {
        throw new Error(`Direkter Zugriff auf Property '${prop}' ist nicht erlaubt.`);
      }
      return target[prop];
    },
    deleteProperty() {
      throw new Error('Löschen von Properties ist nicht erlaubt.');
    },
    defineProperty() {
      throw new Error('Definition von neuen Properties ist nicht erlaubt.');
    },
  });
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    const value = rest.join('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  return cookies;
}

export class App {
  constructor(host, port, templateDir) {
    this.host = host || 'localhost';
    this.port = port || 3000;
    this.templateDir = templateDir || 'templates';
    this.beforeRequestCallbacks = [];
    this.beforeResponseCallbacks = [];
    this.globals = {};
    this.session = createProtectedSession();
  }

  staticPath = '/static/';

  routes = {};

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

  redirect = (url, status = 302) => {
    return [{ status, content: url }]
  };

  sendFileFromDir = (path) => {
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
    return [responseContent, statusCode, contentType];
  }

  requestListener = async (request, response) => {
    let clientKey = getClientKeyFromClientSession(request);
    if (!clientKey) {
      clientKey = uuidv4();
    }
    request.clientKey = clientKey;

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
        statusCode = 200;
        responseContent = fileContent;
      } catch {
        contentType = types.plain;
        statusCode = 404;
        responseContent = 'Not found';
      }
    } else if (!matchedRoute) {
      statusCode = 404;
      responseContent = 'Not found';
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
      const [res, _status, mimeType] = await matchedRoute.handler(request, response, matchedRoute.params);
      responseContent = res;
      statusCode = statusCode || 200;
      contentType =  mimeType || "text/html";
      if (typeof responseContent === 'object' && [301, 302].includes(responseContent.status)) {
        statusCode = responseContent.status;
        response.setHeader("Location", responseContent.content);
        responseContent = '';
      }
    }
    response.setHeader("Server", 'TMPLTR');
    response.setHeader("Content-Length", Buffer.byteLength(responseContent));
    response.setHeader("Content-Type", contentType);
    const cookieConsent = getCookieConsent(request);

    const existingCookies = parseCookies(request);
    const cookies = [];

    if ('cookie-consent' in existingCookies || cookieConsent) {
      cookies.push(`cookie-consent=${cookieConsent}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${cookieConsent ? '1900' : '0'}`);
    }
    if ('tmpltr-session' in existingCookies || clientKey) {
      cookies.push(`tmpltr-session=${clientKey}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${cookieConsent ? '1900' : '0'}`);
    }

    if (cookieConsent) {
      this.session.setValue('cookie-consent', true, request);
    }

    response.setHeader('Set-Cookie', cookies);

    this.beforeResponseCallbacks.forEach(async callback => await callback(request, response));
    if (response.statusCode === 200 && statusCode !== 200) {
      response.writeHead(statusCode);
    }
    response.end(responseContent);
    return;
  }

  renderTemplate = (fileName, context = {}, modifications, _request, _response) => {
    context.globals = this.globals;
    const regexExtends = /{% extends\s+([^\s]+)\s* %}/;
    const content = fs.readFileSync(`${this.templateDir}/${fileName}`, 'utf-8');

    const match = content.match(regexExtends);
    let base = '';
    if (match && match[1]) {
      base = fs.readFileSync(`${this.templateDir}/${match[1]}`, 'utf-8');
    }

    let result = content.replace(regexExtends, '');
    const blocks = extractBlocksTemplate(result);
    if (base) {
      result = replaceBlocks(base, blocks);
    }

    result = replaceConditionals(result, context);

    if (context) {
      result = replaceContext(result, context);
    }

    if (modifications) {
      result = replaceModifications(result, modifications);
    }

    return [result];
  }

  server = http.createServer(this.requestListener)

  serve() {
    this.server.listen(this.port, this.host, () => {
      console.log(`Server running at http://${this.host}:${this.port}/`);
    });
  }
}
