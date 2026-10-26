import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenScadWasmRunner } from '../src/openscad/OpenScadWasmRunner.js';
import { Semaphore } from '../src/security/limits.js';

vi.mock('node:worker_threads', () => ({ Worker: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('cancellable concurrency permits', () => {
  it('removes cancelled waiters without starting them or losing a permit', async () => {
    const semaphore = new Semaphore(1);
    const gate = deferred<void>();
    const first = semaphore.run(() => gate.promise);
    const controller = new AbortController();
    const cancelledWork = vi.fn(async () => {});
    const cancelled = semaphore.run(cancelledWork, controller.signal);
    const rejection = expect(cancelled).rejects.toThrow('aborted');
    controller.abort();
    await rejection;
    gate.resolve();
    await first;
    await semaphore.run(async () => {});
    expect(cancelledWork).not.toHaveBeenCalled();
  });

  it('never starts pre-cancelled work', async () => {
    const work = vi.fn(async () => {});
    await expect(new Semaphore(1).run(work, AbortSignal.abort())).rejects.toThrow('aborted');
    expect(work).not.toHaveBeenCalled();
  });

  it('transfers a permit to the queue without admitting a competing caller', async () => {
    const semaphore = new Semaphore(1);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let active = 0;
    let maximum = 0;
    const tasks = gates.map((gate) =>
      semaphore.run(async () => {
        maximum = Math.max(maximum, ++active);
        await gate.promise;
        active--;
      })
    );
    for (const gate of gates) {
      gate.resolve();
      await Promise.resolve();
    }
    await Promise.all(tasks);
    expect(maximum).toBe(1);
  });
});

describe('WASM worker lifetime', () => {
  let worker: EventEmitter & { terminate: ReturnType<typeof vi.fn> };
  const input = { jobId: 'test', jobDir: '/tmp/test', scad: 'cube(1);', format: 'stl' as const };

  beforeEach(() => {
    vi.useFakeTimers();
    worker = Object.assign(new EventEmitter(), { terminate: vi.fn(async () => 0) });
    vi.mocked(Worker).mockReset();
    vi.mocked(Worker).mockImplementation(function () {
      return worker as unknown as Worker;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not construct a worker for an aborted request', async () => {
    await expect(new OpenScadWasmRunner(100).export(input, AbortSignal.abort())).rejects.toThrow(
      'aborted'
    );
    expect(Worker).not.toHaveBeenCalled();
  });

  it('awaits actual worker termination before rejecting cancellation', async () => {
    const terminated = deferred<number>();
    worker.terminate.mockReturnValue(terminated.promise);
    const controller = new AbortController();
    const task = new OpenScadWasmRunner(100).export(input, controller.signal);
    const rejection = expect(task).rejects.toThrow('aborted');
    let settled = false;
    void task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    controller.abort();
    await Promise.resolve();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    terminated.resolve(1);
    await rejection;
    expect(worker.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([25, 1000])('caps requested timeout %i at the configured maximum', async (requested) => {
    const expected = Math.min(requested, 100);
    const task = new OpenScadWasmRunner(100).export({ ...input, timeoutMs: requested });
    const rejection = expect(task).rejects.toThrow(`timed out after ${expected} ms`);
    await vi.advanceTimersByTimeAsync(expected);
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
  });

  it('terminates and cleans up after successful output as well', async () => {
    const task = new OpenScadWasmRunner(100).export(input);
    worker.emit('message', { success: true, result: { ok: true, data: new Uint8Array([1, 2]) } });
    expect(await task).toMatchObject({ ok: true, data: Buffer.from([1, 2]) });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
