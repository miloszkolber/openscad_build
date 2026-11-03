import { parentPort, workerData } from 'node:worker_threads';
import { renderStlImage, type StlImageOptions } from './StlImageRenderer.js';
import { assertWithinBytes } from '../security/limits.js';
import { parseStlGeometry } from '../tools/analyzeModel.js';

try {
  const { stl, options, maxOutputBytes } = workerData as {
    stl: Uint8Array;
    options: StlImageOptions;
    maxOutputBytes: number;
  };
  const bytes = Buffer.from(stl);
  assertWithinBytes('Screenshot STL', bytes.byteLength, maxOutputBytes);
  const image = await renderStlImage(bytes, options);
  assertWithinBytes('Screenshot image', image.data.byteLength, maxOutputBytes);
  parentPort?.postMessage({ result: { ...image, summary: parseStlGeometry(bytes) } });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
