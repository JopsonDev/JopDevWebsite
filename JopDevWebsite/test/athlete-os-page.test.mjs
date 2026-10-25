import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(path.join(root, 'athlete-os', 'index.html'), 'utf8');
const productionWebpack = readFileSync(path.join(root, 'webpack.config.prod.js'), 'utf8');

test('Athlete OS showcase links to the independent application origin', () => {
  assert.match(page, /https:\/\/athlete\.jopdev\.com\//);
  assert.match(page, /Open Athlete OS/);
  assert.match(page, /progressive web app \(PWA\), not a native App Store download/);
  assert.match(page, /There is no IPA or APK file/);
});

test('iPhone instructions describe the Safari Add to Home Screen flow', () => {
  for (const instruction of ['Safari', 'Share', 'Add to Home Screen', 'Open as Web App', 'Add']) {
    assert.match(page, new RegExp(instruction));
  }
});

test('Android install action opens the PWA install entry point', () => {
  assert.match(page, /data-install-athlete/);
  const script = readFileSync(path.join(root, 'js', 'athlete-os-page.mjs'), 'utf8');
  assert.match(script, /\?install=1/);
  assert.match(script, /Android/);
});

test('Webpack emits the showcase at the intended JopDev path', () => {
  assert.match(productionWebpack, /athlete-os\/index\.html/);
  assert.match(productionWebpack, /template: '\.\/athlete-os\/index\.html'/);
});
