import { App } from '../src/app.mjs';
import { DbObject } from '../src/orm.mjs';


const app = new App('0.0.0.0');

app.staticPath = '/static/';
// app.templateDir = '/test/';

let counter = -1;

app.beforeRequest((req, _resp) => console.log(`[Before request] URL: ${req.url}`));
app.beforeResponse((req, _resp) => console.log(`[Before response] URL: ${req.url}`));
app.beforeResponse((req, resp) => {
    resp.setHeader("Server", 'TMPLTR/Demo instance');
});

app.route('/privacy/', async () => app.renderTemplate('privacy.html'));

DbObject.setDbPath('demo.db');

// DbObject.database.exec(`
//   CREATE TABLE data(
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     firstName TEXT,
//     lastName TEXT
//   ) STRICT
// `);

// const insert = DbObject.database.prepare('INSERT INTO data (firstName, lastName) VALUES (?, ?)');

// insert.run('Jack', 'Shephard');
// insert.run('Kate', 'Austen');


class Passenger extends DbObject {
  static tableName = 'data';
  static fieldNames = ['id', 'firstName', 'lastName'];
}

// console.log(Passenger.getAll())
app.route('/', () => {
    const dbRes = Passenger.getByFilter({ firstName: 'Jack' })
    counter++;
    return app.renderTemplate('index.html', { counter: counter, flightNumber: '815', dbItems: dbRes.map(item => `${item.firstName} ${item.lastName}`) });
});

app.route('/examples/', () => {
    counter++;
    return app.renderTemplate('examples.html',
        {
            firstName: 'Jack',
            lastName: 'Shephard',
            status: 'lost',
            counter: counter,
            passengers: [
                'Jack',
                'John',
                'Kate',
                'Sawyer',
                'Hurley',
                'Sayid',
                'Charlie',
                'Claire',
                'Michael',
                'Shannon',
                'Jin-Soo',
                'Sun-Hwa',
                'Boone',
                'Walter',
            ],
        }
    );
});

app.route('/documentation/', async () => app.renderTemplate('documentation.html'));
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
