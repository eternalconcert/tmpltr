import fs from 'fs';
import http from 'http';
import { extname } from 'path';
import { types, extractBlocksTemplate, replaceBlocks, replaceContext } from './utils.mjs';

export class App {
  constructor(host, port, templateDir) {
    this.host = host || 'localhost';
    this.port = port || 3000;
    this.templateDir = templateDir || 'templates';
  }

  staticPath = '';

  routes = {};

  route = (routePath, callback) => {
    this.routes[routePath] = callback;
  }

  requestListener = async (request, response) => {
    let url = request.url;
    if (!url.endsWith('/') && !url.startsWith(this.staticPath)) {
      url = `${url}/`;
    }

    if(url.startsWith(this.staticPath)) {
      const fileName = url.replace(this.staticPath, '');
      try {
        const fileContent = fs.readFileSync(process.cwd() + this.staticPath + fileName);
        const extension = extname(url).slice(1);
        const mimetype = extension ? types[extension] : types.html;
        response.setHeader("Content-Type", mimetype);
        response.setHeader("Content-Length", fileContent.length);
        response.setHeader("Server", 'TMPLTR');
        response.writeHead(200);
        response.end(fileContent);
        return;

      } catch {
        response.setHeader("Content-Type", types.plain)
        response.setHeader("Server", 'TMPLTR');
        response.writeHead(404);
        response.end('Not found');
        return;
      }

    }

    if (!this.routes[url]) {
      response.setHeader("Server", 'TMPLTR');
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const result = await this.routes[url](request, response);
    if (!response._header) {
      response.setHeader("Content-Type", "text/html");
      response.setHeader("Content-Length", result.length);
      response.setHeader("Server", 'TMPLTR');
      response.writeHead(200);

    }
    response.end(result);
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
