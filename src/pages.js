import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, renderMarkdown } from './markdown.js';

export const publicDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
);

// The marker the shipped privacy template carries until the operator replaces it.
export const PRIVACY_TEMPLATE_MARKER = '<!-- prg32:privacy-template -->';

const readPublic = (name) => fs.readFileSync(path.join(publicDirectory, name), 'utf8');

// The notice states the retention the server actually enforces.
export const privacyMarkdown = (config) =>
  readPublic('privacy.md').replaceAll(
    '{{retention_days}}',
    String(config.telemetryRetentionDays),
  );

export const privacyNoticeReady = () =>
  !readPublic('privacy.md').includes(PRIVACY_TEMPLATE_MARKER);

// Every page is self-contained: no third-party fonts, scripts, or images, so
// visiting it discloses nothing to anyone but this server (GDPR art. 5(1)(c)).
export const PAGE_HEADERS = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': [
    "default-src 'none'",
    "style-src 'self'",
    "script-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-content-type-options': 'nosniff',
});

const NAVIGATION = [
  { id: 'status', href: '/', label: 'Status' },
  { id: 'admin', href: '/admin', label: 'Admin' },
  { id: 'privacy', href: '/privacy', label: 'Privacy' },
  { id: 'accessibility', href: '/accessibility', label: 'Accessibility' },
];

const PAGES = {
  status: {
    title: 'Status',
    body: () => readPublic('status.html'),
    script: 'status.js',
  },
  admin: { title: 'Admin', body: () => readPublic('admin.html'), script: 'app.js' },
  privacy: {
    title: 'Privacy notice',
    body: (config) =>
      `<article class="prose">${renderMarkdown(privacyMarkdown(config))}</article>`,
  },
  accessibility: {
    title: 'Accessibility statement',
    body: () =>
      `<article class="prose">${renderMarkdown(readPublic('accessibility.md'))}</article>`,
  },
};

export function renderPage(id, config) {
  const page = PAGES[id];
  const privacyHref = config.privacyNoticeUrl || '/privacy';
  const nav = NAVIGATION.map((item) => {
    const href = item.id === 'privacy' ? privacyHref : item.href;
    const current = item.id === id ? ' aria-current="page"' : '';
    return `<li><a href="${escapeHtml(href)}"${current}>${item.label}</a></li>`;
  }).join('');
  const script = page.script
    ? `\n    <script src="/${page.script}" defer></script>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#2a0f45" />
    <meta name="description" content="Live status of the PRG32 multiplayer relay." />
    <meta name="referrer" content="no-referrer" />
    <title>${page.title} · PRG32 Multiplayer</title>
    <link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="stylesheet" href="/style.css" />
    <script src="/theme.js"></script>${script}
  </head>
  <body data-page="${id}">
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="topbar">
      <a class="brand" href="/">
        <img class="brand-logo" src="/prg32-logo.png" alt="" width="64" height="40" />
        <span class="brand-copy">
          <span class="brand-title">PRG32 Multiplayer</span>
          <span class="brand-tagline">Retro gaming &amp; coding, together</span>
        </span>
      </a>
      <nav class="main-nav" aria-label="Main">
        <ul class="nav-list">${nav}</ul>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false">
          <span class="theme-toggle-icon" aria-hidden="true"></span>
          <span class="theme-toggle-label">Night mode</span>
        </button>
      </nav>
    </header>
    <main id="main" tabindex="-1" class="shell">
${page.body(config)}
    </main>
    <footer class="site-footer">
      <nav aria-label="Footer">
        <ul class="footer-links">
          <li><a href="${escapeHtml(privacyHref)}">Privacy notice</a></li>
          <li><a href="/privacy#data-stored-in-your-browser">Browser storage</a></li>
          <li><a href="/accessibility">Accessibility</a></li>
          <li><a href="/privacy.md">Privacy notice (plain text)</a></li>
        </ul>
      </nav>
      <p class="footer-note">
        No cookies, analytics, advertising trackers, or third-party resources.
      </p>
    </footer>
  </body>
</html>
`;
}
