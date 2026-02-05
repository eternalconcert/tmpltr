import fs from 'fs';
import { test, mock } from 'node:test';
import assert from 'node:assert';

import { App } from '../src/app.mjs';

const app = new App();

test('simple template', (t) => {
  mock.method(fs, 'readFileSync', () => 'hello, world');
  const rendered = app.renderTemplate('simple.html');
  assert.strictEqual(rendered, 'hello, world');
});

test('template with single varialbe in context', (t) => {
  mock.method(fs, 'readFileSync', () => 'Hello {{ name }}!');
  const rendered = app.renderTemplate('index.html', { name: 'Jack' });
  assert.strictEqual(rendered, 'Hello Jack!');
});

test('template with multiple varialbes in context', (t) => {
  mock.method(fs, 'readFileSync', () => 'Hello {{ firstName }} {{ lastName }}!');
  const rendered = app.renderTemplate('index.html', { firstName: 'Jack', lastName: 'Shephard' });
  assert.strictEqual(rendered, 'Hello Jack Shephard!');
});

test('template extended from base', (t) => {
  mock.method(fs, 'readFileSync', (fileName) => {
    if (fileName === 'templates/base.html') {
      return 'base content {% block childContent %}';
    }
    if (fileName === 'templates/index.html') {
      return '{% extends base.html %} {% block childContent %}template content{% endblock %}';
    }
   });
  const rendered = app.renderTemplate('index.html');
  assert.strictEqual(rendered, 'base content template content');
});

test('variables used in extended templates, base and child template usage', (t) => {
  mock.method(fs, 'readFileSync', (fileName) => {
    if (fileName === 'templates/base.html') {
      return 'base content: {{ name }} {% block childContent %}';
    }
    if (fileName === 'templates/index.html') {
      return '{% extends base.html %} {% block childContent %}template content: {{ name }}{% endblock %}';
    }
  });
  const rendered = app.renderTemplate('index.html', { name: 'Jack' });
  assert.strictEqual(rendered, 'base content: Jack template content: Jack');
});

test('modify callback', (t) => {
  mock.method(fs, 'readFileSync', () => '{% modify toLower %}HELLO, WORLD{% endmodify %}');
  const rendered = app.renderTemplate('index.html', {}, {'toLower': (text) => text.toLowerCase()});
  assert.strictEqual(rendered, 'hello, world');
});

test('modify callback, same, mutliple calls', (t) => {
  mock.method(fs, 'readFileSync', () => '{% modify toLower %}HELLO, WORLD{% endmodify %}<br />{% modify toLower %}Lost{% endmodify %}');
  const rendered = app.renderTemplate('index.html', {}, {'toLower': (text) => text.toLowerCase()});
  assert.strictEqual(rendered, 'hello, world<br />lost');
});

test('modify callback, different, mutliple calls', (t) => {
  mock.method(fs, 'readFileSync', () => '{% modify toLower %}HELLO, WORLD{% endmodify %}<br />{% modify replace %}Lost11!1{% endmodify %}');
  const rendered = app.renderTemplate('index.html', {}, {'toLower': (text) => text.toLowerCase(), 'replace': (text) => text.replaceAll('1', '!')});
  assert.strictEqual(rendered, 'hello, world<br />Lost!!!!');
});
