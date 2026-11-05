import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../src/markdown.js';

test('renders the notice subset', () => {
  const html = renderMarkdown(
    '# Title\n\nSome **bold** and `code`.\n\n- one\n  continued\n- two\n\n1. first',
  );
  assert.match(html, /<h1 id="title">Title<\/h1>/);
  assert.match(html, /<p>Some <strong>bold<\/strong> and <code>code<\/code>\.<\/p>/);
  assert.match(html, /<ul><li>one continued<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
});

test('escapes markup and drops unsafe links and comments', () => {
  const html = renderMarkdown(
    '<!-- hidden -->\n<script>alert(1)</script> [x](javascript:evil) [ok](https://example.org/?a=1&b=2) [mail](mailto:dpo@example.org)',
  );
  assert.doesNotMatch(html, /<script|hidden|javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(
    html,
    /<a href="https:\/\/example\.org\/\?a=1&amp;b=2" rel="noopener noreferrer">ok<\/a>/,
  );
  assert.match(html, /<a href="mailto:dpo@example\.org">mail<\/a>/);
  assert.match(html, / x /);
});
