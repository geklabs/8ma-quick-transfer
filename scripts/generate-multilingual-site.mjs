import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = 'https://t.8ma.co/about/';
const sourceLocale = 'en';
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
  'guides/unstable-file-transfer-speed/index.html',
  'press/index.html',
  'privacy.html',
  'terms.html',
];

function selectedPagesFromArgs(args) {
  const selected = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--only') {
      if (!args[index + 1]) throw new Error('--only requires a page path');
      selected.push(...args[++index].split(','));
    } else if (argument.startsWith('--only=')) {
      selected.push(...argument.slice('--only='.length).split(','));
    }
  }
  if (selected.length === 0) return pages;
  const normalized = [...new Set(selected.map((item) => item.trim()).filter(Boolean))];
  const unknown = normalized.filter((item) => !pages.includes(item));
  if (unknown.length > 0) throw new Error(`Unknown --only page: ${unknown.join(', ')}`);
  return normalized;
}

function selectedLocalesFromArgs(args) {
  let requested = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--locales') {
      if (!args[index + 1]) throw new Error('--locales requires language codes');
      requested.push(...args[++index].split(','));
    } else if (argument.startsWith('--locales=')) {
      requested.push(...argument.slice('--locales='.length).split(','));
    }
  }
  if (requested.length === 0) return generatedLocales;
  requested = [...new Set(requested.map((item) => item.trim()).filter(Boolean))];
  const byCode = new Map(generatedLocales.map((locale) => [locale.code, locale]));
  const unknown = requested.filter((code) => !byCode.has(code));
  if (unknown.length > 0) throw new Error(`Unknown --locales value: ${unknown.join(', ')}`);
  return requested.map((code) => byCode.get(code));
}

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
  if (tag.name === 'html' && ['lang', 'dir'].includes(attribute)) return true;
  if (tag.name !== 'meta' || attribute !== 'content') return false;
  const name = tag.attributes.get('name')?.toLowerCase();
  const property = tag.attributes.get('property')?.toLowerCase();
  return ['description', 'keywords'].includes(name)
    || ['twitter:title', 'twitter:description'].includes(name)
    || ['og:title', 'og:description', 'og:image:alt', 'og:locale', 'og:locale:alternate'].includes(property);
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

const translatableJsonLdKeys = new Set([
  'browserRequirements',
  'description',
  'featureList',
  'headline',
  'inLanguage',
  'name',
  'operatingSystem',
  'text',
]);

function validateJsonLdValue(source, translated, page, pathName = '$', ownerKey = '') {
  if (Array.isArray(source)) {
    if (!Array.isArray(translated) || source.length !== translated.length) {
      throw new Error(`${page}: translated JSON-LD array changed at ${pathName}`);
    }
    source.forEach((value, index) => {
      validateJsonLdValue(value, translated[index], page, `${pathName}[${index}]`, ownerKey);
    });
    return;
  }
  if (source && typeof source === 'object') {
    if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
      throw new Error(`${page}: translated JSON-LD type changed at ${pathName}`);
    }
    const sourceKeys = Object.keys(source).sort();
    const translatedKeys = Object.keys(translated).sort();
    if (sourceKeys.join('\n') !== translatedKeys.join('\n')) {
      throw new Error(`${page}: translated JSON-LD keys changed at ${pathName}`);
    }
    sourceKeys.forEach((key) => {
      validateJsonLdValue(source[key], translated[key], page, `${pathName}.${key}`, key);
    });
    return;
  }
  if (typeof source !== typeof translated) {
    throw new Error(`${page}: translated JSON-LD type changed at ${pathName}`);
  }
  if (source !== translated
    && !(typeof source === 'string' && translatableJsonLdKeys.has(ownerKey))) {
    throw new Error(`${page}: translated JSON-LD protected value changed at ${pathName}`);
  }
}

function validateJsonLdTranslation(sourceBody, translatedBody, page, index) {
  let source;
  let translated;
  try {
    source = JSON.parse(sourceBody);
    translated = JSON.parse(translatedBody);
  } catch {
    throw new Error(`${page}: invalid JSON-LD block ${index + 1}`);
  }
  validateJsonLdValue(source, translated, page, `$jsonld[${index}]`);
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
      if (isJsonLd) {
        validateJsonLdTranslation(body, translatedBodies[index], page, index);
      } else if (body !== translatedBodies[index]) {
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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const prompt = [
      `Translate the human-readable content and SEO metadata of every HTML document in the JSON object into ${locale.language}.`,
      'Return only one valid JSON object with the same file-path keys and complete translated HTML strings.',
      'Preserve every HTML tag, attribute name, CSS class, data attribute, email, and JavaScript exactly.',
      'Never change any href, src, canonical URL, alternate URL, relative path, query string, or URL language prefix.',
      'Keep html lang and dir plus Open Graph locale values unchanged; a deterministic finalizer sets those after validation.',
      'For meta content, translate only description, keywords, Open Graph title/description/image alt, and Twitter title/description. Preserve viewport, robots, theme color, and all other meta values exactly.',
      'Translate visible text, title, aria-labels, image alt text, and human-readable JSON-LD values.',
      'In JSON-LD preserve property names, schema.org @type, URLs, dates, numbers, and structure exactly.',
      'Keep the brands “8ma Quick Transfer” and “8ma Transfer” recognizable. Keep Chrome, Edge, WiFi, QR, GB, Mbps, MB/s, and URLs accurate.',
      'Use natural search language for localized long-tail keywords, not literal word-for-word phrasing.',
      'Do not add implementation details, claims, features, or technologies absent from the source.',
      lastError ? `The previous attempt was rejected: ${lastError.message}. Correct that exact problem.` : '',
      JSON.stringify(source),
    ].filter(Boolean).join('\n');
    try {
      const response = await fetch('https://open-agent.yuancore.com/open/llm/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error(`translation HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      const raw = String(payload.result || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const translated = JSON.parse(raw);
      for (const relativePath of batch) {
        if (typeof translated[relativePath] !== 'string') throw new Error(`missing ${relativePath}`);
        validateTranslation(source[relativePath], translated[relativePath], relativePath);
      }
      return translated;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) console.warn(`${locale.code}: rejected translation attempt ${attempt}: ${lastError.message}`);
    }
  }
  throw new Error(`${locale.code}: translation rejected after 3 attempts: ${lastError?.message ?? 'unknown error'}`);
}

async function generateLocale(locale, pageSubset = pages) {
  const translated = {};
  for (let index = 0; index < pageSubset.length; index += 2) {
    Object.assign(translated, await translateBatch(locale, pageSubset.slice(index, index + 2)));
    console.log(`${locale.code}: ${Math.min(index + 2, pageSubset.length)}/${pageSubset.length}`);
  }
  for (const relativePath of pageSubset) {
    const destination = path.join(root, locale.code, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    const finalized = finalizeHtml(translated[relativePath], { ...locale, path: locale.code }, relativePath);
    validateSafeHtml(finalized, `${locale.code}/${relativePath}`);
    await writeFile(destination, finalized, 'utf8');
  }
}

async function refreshExistingAlternates(pageSubset = pages) {
  for (const locale of locales.slice(0, 2)) {
    for (const relativePath of pageSubset) {
      const file = path.join(root, locale.path, relativePath);
      const html = await readFile(file, 'utf8');
      const finalized = finalizeHtml(html, locale, relativePath);
      validateSafeHtml(finalized, `${locale.code}/${relativePath}`);
      await writeFile(file, finalized, 'utf8');
    }
  }
}

export async function writeSitemap() {
  const entries = pages.flatMap((relativePath) => locales.map((locale) => {
    const links = [
      ...locales.map((alternate) => `    <xhtml:link rel="alternate" hreflang="${alternate.code}" href="${publicUrl(alternate, relativePath)}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${publicUrl(locales[0], relativePath)}" />`,
    ].join('\n');
    return `  <url>\n    <loc>${publicUrl(locale, relativePath)}</loc>\n${links}\n  </url>`;
  }));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
  await writeFile(path.join(root, 'sitemap.xml'), sitemap, 'utf8');
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function writeTranslationManifest(pageSubset = pages, localeSubset = generatedLocales) {
  const isFullGeneration = pageSubset.length === pages.length
    && localeSubset.length === generatedLocales.length;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'translation-manifest.json'), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (!manifest || manifest.version !== 2 || manifest.sourceLocale !== sourceLocale) {
    if (!isFullGeneration) {
      throw new Error('A complete generation is required to initialize translation-manifest.json');
    }
    manifest = { version: 2, sourceLocale, pages: {} };
  }
  for (const relativePath of pageSubset) {
    const source = await sha256File(path.join(root, sourceLocale, relativePath));
    const entry = manifest.pages[relativePath] ?? { translations: {} };
    for (const locale of localeSubset) {
      entry.translations[locale.code] = {
        source,
        output: await sha256File(path.join(root, locale.code, relativePath)),
      };
    }
    manifest.pages[relativePath] = entry;
  }
  for (const relativePath of pages) {
    const entry = manifest.pages[relativePath];
    const localeCodes = Object.keys(entry?.translations ?? {}).sort();
    if (localeCodes.join('\n') !== generatedLocales.map((locale) => locale.code).sort().join('\n')) {
      throw new Error(`Translation manifest is incomplete for ${relativePath}`);
    }
  }
  await writeFile(
    path.join(root, 'translation-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

if (path.resolve(process.argv[1] ?? '') === import.meta.filename) {
  const args = process.argv.slice(2);
  const selectedPages = selectedPagesFromArgs(args);
  const selectedLocales = selectedLocalesFromArgs(args);
  for (let index = 0; index < selectedLocales.length; index += 2) {
    await Promise.all(selectedLocales.slice(index, index + 2).map((locale) => generateLocale(locale, selectedPages)));
  }
  await refreshExistingAlternates(selectedPages);
  await writeTranslationManifest(selectedPages, selectedLocales);
  await writeSitemap();
  console.log(`Generated ${selectedLocales.length * selectedPages.length} localized pages and refreshed sitemap.`);
}
