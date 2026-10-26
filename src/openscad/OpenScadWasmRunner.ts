import { Worker } from 'node:worker_threads';
import {
  type OpenScadExportInput,
  type OpenScadExportResult,
  type OpenScadRunResult,
  type OpenScadRunner,
  type OpenScadValidateInput
} from './OpenScadRunner.js';
import type {
  SerializedWorkerError,
  WasmWorkerRequest,
  WasmWorkerResponse
} from './wasmWorkerProtocol.js';

export class OpenScadWasmRunner implements OpenScadRunner {
  constructor(private readonly maxTimeoutMs: number) {}

  async validate(input: OpenScadValidateInput, signal?: AbortSignal): Promise<OpenScadRunResult> {
    return this.runInWorker({ operation: 'validate', input }, input.timeoutMs, signal);
  }

  async export(input: OpenScadExportInput, signal?: AbortSignal): Promise<OpenScadExportResult> {
    return this.runInWorker({ operation: 'export', input }, input.timeoutMs, signal);
  }

  private async runInWorker<T extends OpenScadRunResult>(
    request: WasmWorkerRequest,
    requestedTimeoutMs = this.maxTimeoutMs,
    signal?: AbortSignal
  ): Promise<T> {
    signal?.throwIfAborted();
    const timeoutMs = Math.min(requestedTimeoutMs, this.maxTimeoutMs);
    const worker = new Worker(new URL('./OpenScadWasmWorker.js', import.meta.url), {
      workerData: request
    });

    let cleanup = () => {};
    try {
      return await new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          fail(
            new Error(
              `OpenSCAD WASM execution timed out after ${timeoutMs} ms; the worker was terminated.`
            )
          );
        }, timeoutMs);

        const onAbort = () => fail(signal?.reason);
        cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          worker.off('message', onMessage);
          worker.off('error', onError);
          worker.off('exit', onExit);
        };

        const fail = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        };

        const onMessage = (message: unknown) => {
          if (settled) {
            return;
          }
          settled = true;

          const response = message as WasmWorkerResponse;
          if (!response || typeof response !== 'object' || !('success' in response)) {
            reject(new Error('OpenSCAD WASM worker returned an invalid response.'));
            return;
          }

          if (!response.success) {
            reject(deserializeWorkerError(response.error));
            return;
          }

          resolve(normalizeWorkerResult(response.result) as T);
        };

        const onError = (error: Error) => fail(error);
        const onExit = (code: number) => {
          if (settled) {
            return;
          }
          fail(new Error(`OpenSCAD WASM worker exited before returning a result (code ${code}).`));
        };

        worker.once('message', onMessage);
        worker.once('error', onError);
        worker.once('exit', onExit);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) {
          onAbort();
        }
      });
    } finally {
      // Do not release the concurrency permit until the worker has actually exited.
      try {
        await worker.terminate();
      } finally {
        cleanup();
      }
    }
  }
}

function normalizeWorkerResult(result: OpenScadRunResult): OpenScadRunResult {
  const maybeExport = result as OpenScadRunResult & { data?: unknown };
  if (maybeExport.data instanceof Uint8Array && !Buffer.isBuffer(maybeExport.data)) {
    return {
      ...result,
      data: Buffer.from(maybeExport.data)
    } as OpenScadExportResult;
  }

  return result;
}

function deserializeWorkerError(error: SerializedWorkerError): Error {
  const result = new Error(error.message);
  result.name = error.name || 'Error';
  result.stack = error.stack;
  return result;
}
