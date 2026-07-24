import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSafeHtml, validateTranslation } from './generate-multilingual-site.mjs';

const source = await readFile(new URL('../en/index.html', import.meta.url), 'utf8');
const guideSource = await readFile(
  new URL('../en/guides/unstable-file-transfer-speed/index.html', import.meta.url),
  'utf8',
);
validateTranslation(source, source, 'control');
validateTranslation(guideSource, guideSource, 'guide-control');

const attacks = [
  {
    source,
    translated: source.replace('href="https://t.8ma.co"', 'href=https://evil.example href="https://t.8ma.co"'),
  },
  {
    source,
    translated: source.replace('<meta name="description"', '<meta name="description" http-equiv="&#x72;efresh"'),
  },
  {
    source,
    translated: source.replace(
      '<script src="../script.js" defer></script>',
      '<script data-note="type=\'application/ld+json\'" src=https://evil.example/payload.js>0</script>',
    ),
  },
  {
    source: guideSource,
    translated: guideSource.replace(
      '"mainEntityOfPage": "https://t.8ma.co/about/en/guides/unstable-file-transfer-speed/"',
      '"mainEntityOfPage": "https://evil.example/phishing"',
    ),
  },
  {
    source,
    translated: source.replace(
      '"sameAs": ["https://github.com/geklabs/8ma-quick-transfer"]',
      '"sameAs": ["https://evil.example/impersonation"]',
    ),
  },
];

attacks.forEach((attack, index) => {
  assert.notEqual(attack.translated, attack.source, `attack ${index + 1} fixture must alter the source`);
  assert.throws(() => validateTranslation(attack.source, attack.translated, `attack-${index + 1}`));
});

for (const language of ['es', 'ar', 'hi', 'fr', 'ja', 'ko']) {
  const html = await readFile(new URL(`../${language}/index.html`, import.meta.url), 'utf8');
  validateSafeHtml(html, `${language}/index.html`);
}

console.log('OK generator validation rejects active content and protected JSON-LD changes');
