// A deliberately small Markdown subset for the operator-edited notices in
// public/*.md: headings, paragraphs, bullet and numbered lists, **bold**,
// `code`, and links. Everything is escaped first, so a notice can never inject
// markup or scripts into the page. HTML comments are dropped (they carry
// editing hints such as the privacy-template marker).

const escapeHtml = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// Only web, mail, same-site, and fragment links are rendered as links.
const safeHref = (href) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href);

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const inline = (raw) => {
  const codes = [];
  let text = escapeHtml(raw).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const decoded = href.replaceAll('&amp;', '&');
    if (!safeHref(decoded)) return label;
    const external = /^https?:\/\//i.test(decoded);
    return `<a href="${href}"${external ? ' rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
};

export function renderMarkdown(source) {
  const lines = source.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(`<li>${inline((bullet || numbered)[1])}</li>`);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (list && /^\s+/.test(line)) {
      // An indented continuation line belongs to the previous list item.
      const last = list.items.pop().replace(/<\/li>$/, '');
      list.items.push(`${last} ${inline(line.trim())}</li>`);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join('\n');
}

export { escapeHtml };
