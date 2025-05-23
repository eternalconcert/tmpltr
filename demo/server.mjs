import { App } from '../src/app.mjs';
import { DbObject } from '../src/orm.mjs';
import url from 'url';

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

DbObject.setDb('demo.db');

const initDb = () => {
  DbObject.database.exec(`
    CREATE TABLE data(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      gender TEXT
    ) STRICT
  `);
  const insert = DbObject.database.prepare('INSERT INTO data (firstName, lastName, gender) VALUES (?, ?, ?)');

  insert.run('Jack', 'Shephard', 'm');
  insert.run('Hugo', 'Reyes', 'm');
  insert.run('Jin-Soo', 'Kwon', 'm');
  insert.run('Kate', 'Austen', 'f');
  insert.run('Claire', 'Littleton', 'f');
  insert.run('Sun-Hwa', 'Kwon', 'f');
}

// initDb();

class Passenger extends DbObject {
  static tableName = 'data';
  static fieldNames = ['id', 'firstName', 'lastName', 'gender'];
}

app.route('/', () => {
    counter++;
    return app.renderTemplate('index.html', {
        counter: counter,
        flightNumber: '815',
    });
});

app.route('/examples/', () => {
    const dbRes = Passenger.getByFilter({ gender: 'f' })
    return app.renderTemplate('examples.html',
        {
            dbItems: dbRes.map(item => `${item.firstName} ${item.lastName}`),
            passenger: { name: { firstName: 'John', lastName: 'Locke' } },
            firstName: 'Jack',
            lastName: 'Shephard',
            status: 'lost',
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
app.route('/features/', async () => app.renderTemplate('features.html'));
app.route('/imprint/', async () => app.renderTemplate('imprint.html'));
app.route('/privacy/', async () => app.renderTemplate('privacy.html'));

app.route('/test/', async () => {
    const data = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    const json = await data.json();
    return app.renderTemplate('test.html', json);
});

app.route('/cookie/set/', (request, response) => {
    const parsedUrl = url.parse(request.url, true);
    const query = parsedUrl.query;
    app.session.setValue('name', query.value, request)
    return `you requsadfsadfested: ${request.url} with ${query.value}`;
});

app.route('/cookie/', (request) => {
    return `value: ${app.session.getValue('name', request)}`;
});

app.route('/reqresp/', (request, response) => {
    response.writeHead(404);
    return `you requested: ${request.url}`;
});

app.serve();
