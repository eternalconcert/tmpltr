import { App } from '../src/app.mjs';

const app = new App();

app.route('/', () => 'hello, world');

app.serve();
