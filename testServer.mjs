import { App } from './app.mjs';
import { renderTemplate }  from './utils.mjs';

const app = new App();

app.staticPath = '/static/';

app.route('/', () => renderTemplate('templates/index.html', {name: 'Bernd Benutzer'}));
app.route('/test/', () => renderTemplate('templates/test.html'));

app.serve();
