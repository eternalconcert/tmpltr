import http from 'http';

export class App {
  constructor(host, port) {
    this.host = host || 'localhost';
    this.port = port || 3000;
  }

  routes = {};

  route = (routePath, callback) => {
    this.routes[routePath] = callback;
  }

  requestListener = (request, response) => {
    let url = request.url;
    if (!url.endsWith('/')) {
      url = `${url}/`;
    }

    if (!this.routes[url]) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.setHeader("Content-Type", "text/html");
    response.writeHead(200);
    response.end(this.routes[url]());
    return;

  }



  server = http.createServer(this.requestListener)

  serve() {
    this.server.listen(this.port, this.host, () => {
      console.log(`Server running at http://${this.host}:${this.port}/`);
    });

  }
}
