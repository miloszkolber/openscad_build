import { Worker } from 'node:worker_threads';
import type { StlImageOptions } from './StlImageRenderer.js';
import type { ScreenshotToolResult } from '../types/toolResults.js';

export interface ImageWorkerResult {
  data: Buffer;
  format: 'png' | 'webp';
  width: number;
  height: number;
  summary: ScreenshotToolResult['summary'];
}

// Source-mode tests/dev use the compiled worker, just as the server build does.
const workerUrl = import.meta.url.endsWith('.ts')
  ? new URL('../../dist/src/render/StlImageWorker.js', import.meta.url)
  : new URL('./StlImageWorker.js', import.meta.url);

export async function renderImageInWorker(
  stl: Buffer,
  options: StlImageOptions,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal
): Promise<ImageWorkerResult> {
  signal?.throwIfAborted();
  if (timeoutMs <= 0) throw new Error('Screenshot execution timed out.');
  const worker = new Worker(workerUrl, { workerData: { stl, options, maxOutputBytes } });
  let cleanup = () => {};
  try {
    return await new Promise<ImageWorkerResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Screenshot execution timed out; the image worker was terminated.')),
        timeoutMs
      );
      const onAbort = () => reject(signal?.reason);
      const onError = (error: Error) => reject(error);
      const onExit = () => reject(new Error('Image worker exited before returning a result.'));
      const onMessage = (message: { error?: string; result?: ImageWorkerResult }) => {
        if (message.error) reject(new Error(message.error));
        else if (message.result)
          resolve({ ...message.result, data: Buffer.from(message.result.data) });
        else reject(new Error('Invalid image worker response.'));
      };
      cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      worker.once('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  } finally {
    try {
      await worker.terminate();
    } finally {
      cleanup();
    }
  }
}
