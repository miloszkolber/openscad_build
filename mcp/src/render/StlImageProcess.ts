import { assertWithinBytes } from '../security/limits.js';
import { parseStlGeometry } from '../tools/analyzeModel.js';
import { renderStlImage, type StlImageOptions } from './StlImageRenderer.js';

interface ImageProcessRequest {
  stl: Uint8Array;
  options: StlImageOptions;
  maxOutputBytes: number;
}

if (!process.send) {
  throw new Error('StlImageProcess must be started with an IPC channel.');
}

process.once('disconnect', () => process.exit(0));

process.once('message', async (request: ImageProcessRequest) => {
  try {
    const bytes = Buffer.from(request.stl);
    assertWithinBytes('Screenshot STL', bytes.byteLength, request.maxOutputBytes);
    const image = await renderStlImage(bytes, request.options);
    assertWithinBytes('Screenshot image', image.data.byteLength, request.maxOutputBytes);
    send({ result: { ...image, summary: parseStlGeometry(bytes) } });
  } catch (error) {
    send({ error: error instanceof Error ? error.message : String(error) });
  }
});

function send(message: unknown): void {
  process.send?.(message, (error) => {
    process.exit(error ? 1 : 0);
  });
}
