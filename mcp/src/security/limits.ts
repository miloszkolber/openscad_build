export const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  '.scad',
  '.stl',
  '.3mf',
  '.off',
  '.csg',
  '.dxf',
  '.svg',
  '.png',
  '.webp',
  '.json',
  '.txt'
]);

export interface LimitConfig {
  maxRenderMs: number;
  maxOutputBytes: number;
  maxInputBytes: number;
  maxParallelJobs: number;
}

export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error('MAX_PARALLEL_JOBS must be a positive integer.');
    }
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      signal?.throwIfAborted();
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.active < this.max) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        const index = this.queue.indexOf(grant);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(grant);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Transfer the existing permit before another caller can acquire it.
      next();
    } else {
      this.active -= 1;
    }
  }
}

export function mbToBytes(value: number): number {
  return Math.floor(value * 1024 * 1024);
}

export function assertWithinBytes(label: string, byteLength: number, maxBytes: number): void {
  if (byteLength > maxBytes) {
    throw new Error(`${label} is ${byteLength} bytes, above the ${maxBytes} byte limit.`);
  }
}
