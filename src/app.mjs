import fs from 'fs';
import http from 'http';
import { extname } from 'path';
import { types, extractBlocksTemplate, replaceBlocks, replaceContext, getContentType } from './utils.mjs';

export class App {
  constructor(host, port, templateDir) {
    this.host = host || 'localhost';
    this.port = port || 3000;
    this.templateDir = templateDir || 'templates';
    this.beforeRequestCallbacks = [];
    this.beforeResponseCallbacks = [];
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

  requestListener = async (request, response) => {
    this.beforeRequestCallbacks.forEach(async callback => await callback(request, response));

    let url = request.url;
    if (!url.endsWith('/') && !url.startsWith(this.staticPath)) {
      url = `${url}/`;
    }

    let responseContent = '';
    let statusCode = 0;
    let contentType = types.plain;
    if(url.startsWith(this.staticPath)) {
      const fileName = url.replace(this.staticPath, '');
      try {
        const fileContent = fs.readFileSync(process.cwd() + this.staticPath + fileName);
        const extension = extname(url).slice(1);
        contentType = extension ? getContentType(extension) : types.html;
        statusCode = 200;
        responseContent = fileContent;
      } catch {
        contentType = types.plain;
        statusCode = 404;
        responseContent = 'Not found';
      }
    }
    else if (!this.routes[url]) {
      statusCode = 404;
      responseContent = 'Not found';
    }

    if (!statusCode) {
      responseContent = await this.routes[url](request, response);
      contentType = "text/html";
      statusCode = 200;
    }
    response.setHeader("Server", 'TMPLTR');
    response.setHeader("Content-Length", responseContent.length);
    response.setHeader("Content-Type", contentType);
    this.beforeResponseCallbacks.forEach(async callback => await callback(request, response));
    if (response.statusCode === 200 && statusCode !== 200) {
      response.writeHead(statusCode);
    }
    response.end(responseContent);
    return;
  }

  renderTemplate = (fileName, context, _request, _response) => {
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
    if (context) {
      result = replaceContext(result, context);
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
