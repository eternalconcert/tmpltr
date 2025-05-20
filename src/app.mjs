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
    return { status, content: url }
  };

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

    let responseContent = '';
    let statusCode = 0;
    let contentType = types.plain;
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
    }
    else if (!this.routes[pathname]) {
      statusCode = 404;
      responseContent = 'Not found';
    }

    // Nur bei POST: Body einlesen und request.form setzen
    if (request.method === 'POST') {
      await new Promise((resolve) => {
        let body = '';
        request.on('data', chunk => body += chunk.toString());
        request.on('end', () => {
          request.form = new URLSearchParams(body);
          resolve();
        });
      });
    }

    // Falls es eine Route gibt, sie ausführen (request.form ist jetzt verfügbar!)
    if (!statusCode && this.routes[pathname]) {
      responseContent = await this.routes[pathname](request, response);
      if (typeof responseContent === 'object' && [301, 302].includes(responseContent.status)) {
        statusCode = responseContent.status;
        response.setHeader("Location", responseContent.content);
        responseContent = '';
      } else {
        contentType = "text/html";
        statusCode = 200;
      }
    }
    response.setHeader("Server", 'TMPLTR');
    response.setHeader("Content-Length", Buffer.byteLength(responseContent));
    response.setHeader("Content-Type", contentType);
    response.setHeader("Set-Cookie", `tmpltr-session=${clientKey}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`);

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

    return result;
  }

  server = http.createServer(this.requestListener)

  serve() {
    this.server.listen(this.port, this.host, () => {
      console.log(`Server running at http://${this.host}:${this.port}/`);
    });
  }
}
