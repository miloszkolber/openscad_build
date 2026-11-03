// Optional runner for an already authorized CDP endpoint. Never launches a browser.
// Mount browser-check/main.scad: width=18; // [1:1:50] followed by cube([width,7,9]);
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFile, unlink} from 'node:fs/promises';

const browser = await puppeteer.connect({browserURL: process.env.BROWSER_URL || 'http://127.0.0.1:9222'});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.setViewport({width: 927, height: 1297});
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const modelPath = process.env.MODEL_PATH || '/models/browser-check/main.scad';
const selectFile = async path => {
  await page.waitForFunction(path => [...document.querySelectorAll('.file-entry')].some(b => b.title === path.slice(8)), {}, path);
  await page.evaluate(path => [...document.querySelectorAll('.file-entry')].find(b => b.title === path.slice(8)).click(), path);
};
const downloadButton = () => page.$eval('.toolbar-actions button', b => b.disabled);
try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3333/', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('.source-empty');
  assert.equal(await downloadButton(), true, 'No export before a model is selected');
  assert.equal(await page.$('input[type="search"]'), null);
  await selectFile(modelPath);
  await page.waitForFunction(() => document.querySelector('model-viewer')?.getDimensions?.().x === 18);
  await page.waitForFunction(() => !document.querySelector('.toolbar-actions button').disabled);
  console.log('Mounted source preview can export without clicking Render');

  const source = await page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
  const readOnly = await page.evaluate(() => window.monaco.editor.getEditors()[0].getOption(window.monaco.editor.EditorOption.readOnly));
  assert.equal(readOnly, true);
  await page.click('.monaco-editor .view-lines');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.sendCharacter('cube(999);');
  assert.equal(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue()), source, 'Source cannot be pasted over');

  await page.$eval('#parameter-width', input => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '21');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  assert.equal(await downloadButton(), true, 'No stale export while property preview is pending');
  await page.waitForFunction(() => document.querySelector('model-viewer')?.getDimensions?.().x === 21);
  await page.waitForFunction(() => !document.querySelector('.toolbar-actions button').disabled);
  await page.evaluate(() => {
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.stl')) window.exportedSTL = {url: this.href, name: this.download};
    };
    document.querySelector('.toolbar-actions button').click();
  });
  await page.waitForFunction(() => window.exportedSTL);
  const exported = await page.evaluate(async () => {
    const bytes = await (await fetch(window.exportedSTL.url)).arrayBuffer();
    const view = new DataView(bytes), triangles = view.getUint32(80, true);
    if (bytes.byteLength !== 84 + triangles * 50) throw new Error('Expected binary STL');
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < triangles; t++) for (let v = 0; v < 3; v++) for (let axis = 0; axis < 3; axis++) {
      const n = view.getFloat32(84 + t * 50 + 12 + v * 12 + axis * 4, true);
      min[axis] = Math.min(min[axis], n); max[axis] = Math.max(max[axis], n);
    }
    return {triangles, dimensions: max.map((n, i) => n - min[i])};
  });
  assert.deepEqual(exported.dimensions, [21, 7, 9]);
  assert.equal(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue()), source);
  console.log('Property-only update exports the selected dimensions', exported);

  assert.equal(await page.$eval('.logs-panel', logs => logs.open), false);
  await page.click('.logs-panel summary');
  assert.equal(await page.$eval('.logs-panel', logs => logs.open), true);

  await page.click('.paste-entry');
  await page.waitForFunction(() => window.monaco.editor.getEditors()[0].getOption(window.monaco.editor.EditorOption.readOnly) === false);
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('cube([5, 6, 7]);'));
  await page.waitForFunction(() => document.querySelector('model-viewer')?.getDimensions?.().x === 5);
  const pasteIndex = await (await fetch(process.env.APP_URL || 'http://127.0.0.1:3333/api/files')).json();
  assert.equal(JSON.stringify(pasteIndex).includes('pasted.scad'), false, 'Pasted code is not written to the model directory');
  console.log('Pasted code renders from memory without writing files');
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
    belowModel: document.querySelector('.logs-panel').getBoundingClientRect().top >= document.querySelector('.preview-panel').getBoundingClientRect().bottom,
    logsInModel: !!document.querySelector('.model-panel .logs-panel'),
    logsInProperties: !!document.querySelector('.properties-sidebar .logs-panel'),
    font: getComputedStyle(document.body).fontFamily,
  }));
  assert.equal(layout.overflow, false);
  assert.equal(layout.belowModel, true);
  assert.equal(layout.logsInModel, true);
  assert.equal(layout.logsInProperties, false);
  assert.ok(layout.font.includes('system-ui'));
  await page.click('.logs-panel summary');

  // Optional late-added source/relative-include and invalid-source fixtures.
  if (process.env.FIXTURE_DIR) {
    await writeFile(`${process.env.FIXTURE_DIR}/late.scad`, 'include <shape.scad>\nshape(13);\n');
    await page.click('.toolbar > button');
    await selectFile('/models/browser-check/late.scad');
    await page.waitForFunction(() => document.querySelector('model-viewer')?.getDimensions?.().x === 13);
    await writeFile(`${process.env.FIXTURE_DIR}/bad.scad`, 'cube([);');
    await page.click('.toolbar > button');
    await selectFile('/models/browser-check/bad.scad');
    await page.waitForSelector('p[role="alert"]');
    assert.equal(await downloadButton(), true, 'Failed source cannot export');
    await selectFile(modelPath);
    await page.waitForFunction(() => !document.querySelector('.toolbar-actions button').disabled);
    console.log('Live discovery, includes and invalid-source recovery passed');
  }
  assert.deepEqual(errors, [], 'No unhandled page errors');
  if (process.env.SCREENSHOT) await page.screenshot({path: process.env.SCREENSHOT});
} finally {
  if (process.env.FIXTURE_DIR) for (const file of ['late.scad', 'bad.scad']) await unlink(`${process.env.FIXTURE_DIR}/${file}`).catch(() => {});
  await page.close();
  await browser.disconnect();
}
