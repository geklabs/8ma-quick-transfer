import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = 'https://t.8ma.co/about/';
const sourceLocale = 'en';
const buildDate = new Date().toISOString().slice(0, 10);
const generatedLocales = [
  { code: 'es', language: 'Spanish (neutral international Spanish)', label: 'Español', og: 'es_ES', dir: 'ltr' },
  { code: 'ar', language: 'Modern Standard Arabic', label: 'العربية', og: 'ar_AR', dir: 'rtl' },
  { code: 'hi', language: 'Hindi', label: 'हिन्दी', og: 'hi_IN', dir: 'ltr' },
  { code: 'fr', language: 'French (neutral international French)', label: 'Français', og: 'fr_FR', dir: 'ltr' },
  { code: 'ja', language: 'Japanese', label: '日本語', og: 'ja_JP', dir: 'ltr' },
  { code: 'ko', language: 'Korean', label: '한국어', og: 'ko_KR', dir: 'ltr' },
];
const locales = [
  { code: 'zh-CN', path: '', label: '中文', og: 'zh_CN', dir: 'ltr' },
  { code: 'en', path: 'en', label: 'English', og: 'en_US', dir: 'ltr' },
  ...generatedLocales.map((locale) => ({ ...locale, path: locale.code })),
];
const pages = [
  'index.html',
  'guides/index.html',
  'guides/fast-large-file-transfer/index.html',
  'guides/same-wifi-file-transfer/index.html',
  'guides/phone-computer-file-transfer/index.html',
  'guides/file-transfer-without-sign-up/index.html',
  'guides/send-large-files-without-messaging-app/index.html',
  'guides/resume-interrupted-file-transfer/index.html',
  'guides/browser-file-transfer-without-cloud-upload/index.html',
  'guides/computer-to-computer-file-transfer/index.html',
  'press/index.html',
  'privacy.html',
  'terms.html',
];

function publicUrl(locale, relativePath) {
  const suffix = relativePath === 'index.html' ? '' : relativePath.replace(/index\.html$/, '');
  return `${baseUrl}${locale.path ? `${locale.path}/` : ''}${suffix}`;
}

function alternateLinks(relativePath) {
  return [
    ...locales.map((locale) => `    <link rel="alternate" hreflang="${locale.code}" href="${publicUrl(locale, relativePath)}">`),
    `    <link rel="alternate" hreflang="x-default" href="${publicUrl(locales[0], relativePath)}">`,
  ].join('\n');
}

function languageNavigation(relativePath, currentCode) {
  return `<nav class="language-switcher" aria-label="Language">
          ${locales.map((locale) => `<a href="${publicUrl(locale, relativePath)}" lang="${locale.code}" hreflang="${locale.code}" data-language-choice="${locale.code}"${locale.code === currentCode ? ' aria-current="page"' : ''}>${locale.label}</a>`).join('')}
        </nav>`;
}

function finalizeHtml(input, locale, relativePath) {
  const sourceUrl = publicUrl(locales[1], relativePath);
  const targetUrl = publicUrl(locale, relativePath);
  let html = input
    .replace(/<html\s+lang="[^"]+"(?:\s+dir="[^"]+")?(?:\s+data-alternate-path="[^"]*")?>/i, `<html lang="${locale.code}" dir="${locale.dir}">`)
    .replaceAll(sourceUrl, targetUrl)
    .replace(/^\s*<link rel="alternate" hreflang="[^"]+" href="[^"]+">\s*$/gm, '')
    .replace(/(<link rel="canonical" href="[^"]+">)/, `$1\n${alternateLinks(relativePath)}`)
    .replace(/<nav class="language-switcher"[\s\S]*?<\/nav>/, languageNavigation(relativePath, locale.code))
    .replace(/<meta property="og:locale" content="[^"]+">/, `<meta property="og:locale" content="${locale.og}">`)
    .replace(/"inLanguage"\s*:\s*"[^"]+"/g, `"inLanguage": "${locale.code}"`)
    .replace(/^\s*<meta property="og:locale:alternate" content="[^"]+">\s*$/gm, '');
  html = html.replace(/(<meta property="og:locale" content="[^"]+">)/, `$1\n${locales.filter((item) => item.code !== locale.code).map((item) => `    <meta property="og:locale:alternate" content="${item.og}">`).join('\n')}`);
  return html.replace(/\n{3,}/g, '\n\n');
}

function criticalCounts(html) {
  return Object.fromEntries(['html', 'head', 'body', 'main', 'h1', 'script'].map((tag) => [
    tag,
    (html.match(new RegExp(`<${tag}(?:\\s|>)`, 'gi')) ?? []).length,
  ]));
}

function tagSequence(html) {
  return [...html.matchAll(/<(\/?)([a-z][\w:-]*)\b[^>]*>/gi)]
    .map((match) => `${match[1]}${match[2].toLowerCase()}`);
}

function parseStartTags(html, page) {
  const tags = [];
  for (let start = html.indexOf('<'); start >= 0; start = html.indexOf('<', start + 1)) {
    if (!/[a-z]/i.test(html[start + 1] ?? '')) continue;
    let cursor = start + 1;
    const nameStart = cursor;
    while (/[\w:-]/.test(html[cursor] ?? '')) cursor += 1;
    const name = html.slice(nameStart, cursor).toLowerCase();
    const attributes = new Map();
    while (cursor < html.length) {
      while (/\s/.test(html[cursor] ?? '')) cursor += 1;
      if (html[cursor] === '>') {
        cursor += 1;
        break;
      }
      if (html[cursor] === '/' && html[cursor + 1] === '>') {
        cursor += 2;
        break;
      }
      const attributeStart = cursor;
      while (/[\w:.-]/.test(html[cursor] ?? '')) cursor += 1;
      if (cursor === attributeStart) throw new Error(`${page}: malformed <${name}> attribute`);
      const attribute = html.slice(attributeStart, cursor).toLowerCase();
      if (attributes.has(attribute)) throw new Error(`${page}: duplicate ${attribute} attribute on <${name}>`);
      while (/\s/.test(html[cursor] ?? '')) cursor += 1;
      let value = null;
      if (html[cursor] === '=') {
        cursor += 1;
        while (/\s/.test(html[cursor] ?? '')) cursor += 1;
        const quote = html[cursor];
        if (quote !== '"' && quote !== "'") throw new Error(`${page}: unquoted ${attribute} attribute on <${name}>`);
        const valueStart = ++cursor;
        while (cursor < html.length && html[cursor] !== quote) cursor += 1;
        if (cursor >= html.length) throw new Error(`${page}: unterminated ${attribute} attribute on <${name}>`);
        value = html.slice(valueStart, cursor);
        if (/[<>]/.test(value)) throw new Error(`${page}: angle bracket in ${attribute} attribute on <${name}>`);
        cursor += 1;
      }
      attributes.set(attribute, value);
    }
    if (cursor >= html.length && html[cursor - 1] !== '>') throw new Error(`${page}: unterminated <${name}> tag`);
    tags.push({ name, attributes, start, end: cursor });
    start = cursor - 1;
  }
  return tags;
}

function elementBodies(html, tags, name, page) {
  const lowered = html.toLowerCase();
  return tags.filter((tag) => tag.name === name).map((tag) => {
    const closing = lowered.indexOf(`</${name}`, tag.end);
    if (closing < 0) throw new Error(`${page}: missing </${name}>`);
    return html.slice(tag.end, closing);
  });
}

function isTranslatableAttribute(tag, attribute) {
  if (['alt', 'aria-label', 'placeholder', 'title'].includes(attribute)) return true;
  if (tag.name === 'html' && attribute === 'lang') return true;
  if (tag.name !== 'meta' || attribute !== 'content') return false;
  const name = tag.attributes.get('name')?.toLowerCase();
  const property = tag.attributes.get('property')?.toLowerCase();
  return ['description', 'keywords'].includes(name)
    || ['twitter:title', 'twitter:description'].includes(name)
    || ['og:title', 'og:description', 'og:image:alt'].includes(property);
}

function decodedSecurityValue(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);?/g, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&colon;?/gi, ':')
    .replace(/&(tab|newline);?/gi, ' ');
}

export function validateSafeHtml(html, page) {
  const tags = parseStartTags(html, page);
  const forbiddenTags = new Set(['iframe', 'object', 'embed', 'base', 'form']);
  const uriAttributes = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href']);
  for (const tag of tags) {
    if (forbiddenTags.has(tag.name)) throw new Error(`${page}: forbidden <${tag.name}> tag`);
    for (const [attribute, rawValue] of tag.attributes) {
      if (attribute.startsWith('on')) throw new Error(`${page}: inline event handler is forbidden`);
      if (attribute === 'http-equiv') throw new Error(`${page}: http-equiv is forbidden`);
      if (!uriAttributes.has(attribute) || rawValue === null) continue;
      const value = decodedSecurityValue(rawValue).replace(/\s/g, '').toLowerCase();
      if (/^(?:javascript|vbscript):|^data:text\/html/.test(value)) throw new Error(`${page}: dangerous URL scheme`);
    }
  }
  const scriptTags = tags.filter((tag) => tag.name === 'script');
  const scriptBodies = elementBodies(html, tags, 'script', page);
  scriptTags.forEach((tag, index) => {
    if (tag.attributes.get('type') !== 'application/ld+json') return;
    try {
      JSON.parse(scriptBodies[index]);
    } catch {
      throw new Error(`${page}: invalid JSON-LD`);
    }
  });
}

export function validateTranslation(source, translated, page) {
  if (!/^<!doctype html>/i.test(translated.trim())) throw new Error(`${page}: translated document lost doctype`);
  const sourceCounts = criticalCounts(source);
  const translatedCounts = criticalCounts(translated);
  for (const tag of Object.keys(sourceCounts)) {
    if (sourceCounts[tag] !== translatedCounts[tag]) throw new Error(`${page}: translated <${tag}> count changed`);
  }
  const sourceTags = parseStartTags(source, `${page} source`);
  const translatedTags = parseStartTags(translated, `${page} translation`);
  if (tagSequence(source).join('\n') !== tagSequence(translated).join('\n')
    || sourceTags.length !== translatedTags.length) {
    throw new Error(`${page}: translated HTML structure changed`);
  }
  sourceTags.forEach((sourceTag, index) => {
    const translatedTag = translatedTags[index];
    if (sourceTag.name !== translatedTag.name) throw new Error(`${page}: translated tag order changed`);
    const sourceAttributes = [...sourceTag.attributes.keys()].sort();
    const translatedAttributes = [...translatedTag.attributes.keys()].sort();
    if (sourceAttributes.join('\n') !== translatedAttributes.join('\n')) {
      throw new Error(`${page}: translated <${sourceTag.name}> attributes changed`);
    }
    for (const attribute of sourceAttributes) {
      if (!isTranslatableAttribute(sourceTag, attribute)
        && sourceTag.attributes.get(attribute) !== translatedTag.attributes.get(attribute)) {
        throw new Error(`${page}: translated ${attribute} on <${sourceTag.name}> changed`);
      }
    }
  });
  for (const element of ['script', 'style']) {
    const sourceBodies = elementBodies(source, sourceTags, element, `${page} source`);
    const translatedBodies = elementBodies(translated, translatedTags, element, `${page} translation`);
    sourceBodies.forEach((body, index) => {
      const tag = sourceTags.filter((item) => item.name === element)[index];
      const isJsonLd = element === 'script' && tag.attributes.get('type') === 'application/ld+json';
      if (!isJsonLd && body !== translatedBodies[index]) {
        throw new Error(`${page}: translated executable ${element} content changed`);
      }
    });
  }
  validateSafeHtml(translated, page);
}

async function translateBatch(locale, batch) {
  const source = Object.fromEntries(await Promise.all(batch.map(async (relativePath) => [
    relativePath,
    await readFile(path.join(root, sourceLocale, relativePath), 'utf8'),
  ])));
  const prompt = [
    `Translate the human-readable content and SEO metadata of every HTML document in the JSON object into ${locale.language}.`,
    'Return only one valid JSON object with the same file-path keys and complete translated HTML strings.',
    'Preserve every HTML tag, attribute name, CSS class, data attribute, URL, relative path, email, number, schema.org @type, JSON-LD structure, and JavaScript exactly.',
    'Translate visible text, title, description, keywords, Open Graph text, Twitter text, aria-labels, image alt text, and human-readable JSON-LD values.',
    'Keep the brands “8ma Quick Transfer” and “8ma Transfer” recognizable. Keep Chrome, Edge, WiFi, QR, GB, and URLs accurate.',
    'Use natural search language for localized long-tail keywords, not literal word-for-word phrasing.',
    'Do not add implementation details, claims, features, or technologies absent from the source.',
    JSON.stringify(source),
  ].join('\n');
  const response = await fetch('https://open-agent.yuancore.com/open/llm/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error(`${locale.code}: translation HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${locale.code}: ${payload.error}`);
  const raw = String(payload.result || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const translated = JSON.parse(raw);
  for (const relativePath of batch) {
    if (typeof translated[relativePath] !== 'string') throw new Error(`${locale.code}: missing ${relativePath}`);
    validateTranslation(source[relativePath], translated[relativePath], relativePath);
  }
  return translated;
}

async function generateLocale(locale) {
  const translated = {};
  for (let index = 0; index < pages.length; index += 2) {
    Object.assign(translated, await translateBatch(locale, pages.slice(index, index + 2)));
    console.log(`${locale.code}: ${Math.min(index + 2, pages.length)}/${pages.length}`);
  }
  for (const relativePath of pages) {
    const destination = path.join(root, locale.code, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    const finalized = finalizeHtml(translated[relativePath], { ...locale, path: locale.code }, relativePath);
    validateSafeHtml(finalized, `${locale.code}/${relativePath}`);
    await writeFile(destination, finalized, 'utf8');
  }
}

async function refreshExistingAlternates() {
  for (const locale of locales.slice(0, 2)) {
    for (const relativePath of pages) {
      const file = path.join(root, locale.path, relativePath);
      const html = await readFile(file, 'utf8');
      const finalized = finalizeHtml(html, locale, relativePath);
      validateSafeHtml(finalized, `${locale.code}/${relativePath}`);
      await writeFile(file, finalized, 'utf8');
    }
  }
}

async function writeSitemap() {
  const entries = pages.flatMap((relativePath) => locales.map((locale) => {
    const links = [
      ...locales.map((alternate) => `    <xhtml:link rel="alternate" hreflang="${alternate.code}" href="${publicUrl(alternate, relativePath)}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${publicUrl(locales[0], relativePath)}" />`,
    ].join('\n');
    return `  <url>\n    <loc>${publicUrl(locale, relativePath)}</loc>\n${links}\n    <lastmod>${buildDate}</lastmod>\n  </url>`;
  }));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
  await writeFile(path.join(root, 'sitemap.xml'), sitemap, 'utf8');
}

if (path.resolve(process.argv[1] ?? '') === import.meta.filename) {
  for (let index = 0; index < generatedLocales.length; index += 2) {
    await Promise.all(generatedLocales.slice(index, index + 2).map(generateLocale));
  }
  await refreshExistingAlternates();
  await writeSitemap();
  console.log(`Generated ${generatedLocales.length * pages.length} localized pages and refreshed sitemap.`);
}
