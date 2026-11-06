import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StlImageOptions } from './StlImageRenderer.js';
import type { ScreenshotToolResult } from '../types/toolResults.js';

export interface ImageProcessResult {
  data: Buffer;
  format: 'png' | 'webp';
  width: number;
  height: number;
  summary: ScreenshotToolResult['summary'];
}

interface ImageProcessResponse {
  error?: string;
  result?: {
    data: Uint8Array;
    format: 'png' | 'webp';
    width: number;
    height: number;
    summary: ScreenshotToolResult['summary'];
  };
}

// Source-mode tests/dev use the compiled entry point, just as the server build does.
const processPath = import.meta.url.endsWith('.ts')
  ? new URL('../../dist/render/StlImageProcess.js', import.meta.url)
  : new URL('./StlImageProcess.js', import.meta.url);

export async function renderImageInProcess(
  stl: Buffer,
  options: StlImageOptions,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal
): Promise<ImageProcessResult> {
  signal?.throwIfAborted();
  if (timeoutMs <= 0) throw new Error('Screenshot execution timed out.');

  const child = fork(fileURLToPath(processPath), [], {
    serialization: 'advanced',
    execArgv: [],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let markExited = () => {};
  const exited = new Promise<void>((resolve) => {
    markExited = resolve;
  });
  const onChildExit = () => markExited();
  const onChildClose = () => markExited();
  child.once('exit', onChildExit);
  child.once('close', onChildClose);

  let stderr = '';
  let cleanup = () => {};
  try {
    return await new Promise<ImageProcessResult>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(
        () =>
          fail(new Error('Screenshot execution timed out; the image process was terminated.')),
        timeoutMs
      );
      const onAbort = () => fail(signal?.reason);
      const onError = (error: Error) => fail(error);
      const onExit = (code: number | null, exitSignal: NodeJS.Signals | null) => {
        if (settled) return;
        const detail = stderr.trim();
        fail(
          new Error(
            `Image process exited before returning a result (code ${code ?? 'null'}${exitSignal ? `, signal ${exitSignal}` : ''})${detail ? `: ${detail}` : ''}.`
          )
        );
      };
      const onMessage = (message: ImageProcessResponse) => {
        if (settled) return;
        if (!message || typeof message !== 'object') {
          fail(new Error('Invalid image process response.'));
          return;
        }
        if (message.error) {
          fail(new Error(message.error));
          return;
        }
        if (!message.result) {
          fail(new Error('Invalid image process response.'));
          return;
        }
        settled = true;
        resolve({ ...message.result, data: Buffer.from(message.result.data) });
      };
      const onStderr = (chunk: string) => {
        if (stderr.length >= 8192) return;
        stderr += chunk;
        if (stderr.length > 8192) stderr = stderr.slice(0, 8192);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        child.off('message', onMessage);
        child.off('error', onError);
        child.off('exit', onExit);
        child.off('exit', onChildExit);
        child.off('close', onChildClose);
        child.stderr?.off('data', onStderr);
      };
      child.once('message', onMessage);
      child.once('error', onError);
      child.once('exit', onExit);
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', onStderr);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      try {
        child.send({ stl, options, maxOutputBytes }, (error) => {
          if (error) fail(error);
        });
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      // Do not release the caller's concurrency permit until the process has exited.
      await exited;
    } finally {
      cleanup();
    }
  }
}
