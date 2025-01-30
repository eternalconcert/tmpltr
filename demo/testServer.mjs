import { App } from '../src/app.mjs';

const app = new App();

app.staticPath = '/static/';
// app.templateDir = '/test/';

let counter = -1;

app.route('/', () => {
    counter++;
    return app.renderTemplate('index.html', { firstName: 'Jack', lastName: 'Shephard', status: 'lost', counter: counter, items: ['John Locke', 'Kate Austen'] });
});

app.route('/imprint/', async () => app.renderTemplate('imprint.html'));
app.route('/privacy/', async () => app.renderTemplate('privacy.html'));

app.route('/test/', async () => {
    const data = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    const json = await data.json();
    return app.renderTemplate('test.html', json);
});
app.route('/reqresp/', (request, response) => {
    response.writeHead(404);
    return `you requested: ${request.url}`;
});

app.serve();
