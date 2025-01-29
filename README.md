# Example:

    import { App } from './app.mjs';
    import { renderTemplate }  from './utils.mjs';

    const app = new App();
    // or
    const app = new App('localhost', 80);
    // port defaults to 3000, host to localhost

    // also possible:
    app.host = '127.0.0.1';
    app.port = 8080;

    // route registration:
    app.route('/', (_req, _resp) => renderTemplate('templates/index.html', {name: 'Bernd Benutzer'}));

    app.route('/test/', () => renderTemplate('templates/test.html'));

    // the function app.route takes the (relative) url and a callback function, which should return the response content.

    // start the server
    app.serve();

# Utilities

    renderTemplate(templateName, context, request, response);

The context might be undefined if not used, otherwise it must be an object in this form:
    { key: value }
The key can be used in the template and will be replaced by the value.

A template might lool like this:
    \<h1>Index!\</h1>
    Hallo! Das hier ist der Body!<br />
    Im Context steht folgender Name: \<!-- contextVariable key -->

As you can see, the contextVariable is used here.
