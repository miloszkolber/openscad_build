import {createHash} from 'node:crypto';
import {mkdir, writeFile, copyFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const webRoot = path.resolve(import.meta.dirname, '..');
const cache = path.join(webRoot, '.assets');
await mkdir(cache, {recursive: true});

async function download(name, url, sha256) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== sha256) throw new Error(`${name}: checksum mismatch`);
  const target = path.join(cache, name);
  await writeFile(target, data);
  return target;
}

const engine = await download('engine.zip',
  'https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip',
  '0968af31b9c9b3bba68d9031de1695ccae51c32231a1aab4ef27b18c86379f3b');
await mkdir(path.join(cache, 'engine'), {recursive: true});
execFileSync('unzip', ['-jo', engine, 'openscad.js', 'openscad.wasm', '-d', path.join(cache, 'engine')]);

const revision = 'ef7161f03e305982b0b247e9a0b7cc472376dd83';
const fonts = await download('fonts-source.zip',
  `https://codeload.github.com/shantigilbert/liberation-fonts-ttf/zip/${revision}`,
  '5f4fa56ad5950cb480146f12cf377af88b09b5d27d5c182ae9d4ac3d57fad676');
const fontDir = path.join(cache, 'fonts');
await mkdir(fontDir, {recursive: true});
const prefix = `liberation-fonts-ttf-${revision}/`;
execFileSync('unzip', ['-jo', fonts, `${prefix}*.ttf`, `${prefix}LICENSE`, `${prefix}AUTHORS`, '-d', fontDir]);
await copyFile(path.join(webRoot, 'fonts.conf'), path.join(fontDir, 'fonts.conf'));
const output = path.join(webRoot, 'public/fonts.zip');
await mkdir(path.dirname(output), {recursive: true});
await rm(output, {force: true});
execFileSync('zip', ['-qr', output, '.'], {cwd: fontDir});
console.log('Prepared checksum-verified OpenSCAD engine and default fonts.');
