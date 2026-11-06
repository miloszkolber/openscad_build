import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenScadWasmRunner } from '../src/openscad/OpenScadWasmRunner.js';
import { renderImageInProcess } from '../src/render/renderImageInProcess.js';
import { Semaphore } from '../src/security/limits.js';

vi.mock('node:worker_threads', () => ({ Worker: vi.fn() }));
vi.mock('node:child_process', () => ({ fork: vi.fn() }));

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
  const input = { sourcePath: 'test.scad', scad: 'cube(1);', format: 'stl' as const };

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
    expect(vi.getTimerCount()).toBe(0);
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

describe('image process lifetime', () => {
  type FakeChild = EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    stderr: PassThrough;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };

  let child: FakeChild;

  beforeEach(() => {
    vi.useFakeTimers();
    child = Object.assign(new EventEmitter(), {
      send: vi.fn(),
      kill: vi.fn(() => true),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null
    });
    vi.mocked(fork).mockReset();
    vi.mocked(fork).mockImplementation(function () {
      return child as unknown as ChildProcess;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function exitChild(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
  }

  it('does not spawn an image process for an aborted request', async () => {
    await expect(
      renderImageInProcess(Buffer.alloc(0), {}, 100, 1024, AbortSignal.abort())
    ).rejects.toThrow('aborted');
    expect(fork).not.toHaveBeenCalled();
  });

  it('rejects when the image process exits before returning a result', async () => {
    const task = renderImageInProcess(Buffer.alloc(0), {}, 100, 1024);
    const rejection = expect(task).rejects.toThrow(
      /exited before returning a result.*code 1.*boom/
    );
    child.stderr.emit('data', 'boom');
    exitChild(1);
    await rejection;
    expect(child.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates image processing on cancellation and waits for actual exit', async () => {
    const controller = new AbortController();
    const task = renderImageInProcess(Buffer.alloc(0), {}, 100, 1024, controller.signal);
    const rejection = expect(task).rejects.toThrow('aborted');
    controller.abort();
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledOnce();
    let settled = false;
    void task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    exitChild(null, 'SIGKILL');
    await rejection;
    expect(child.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out image processes instead of blocking the HTTP process', async () => {
    const task = renderImageInProcess(Buffer.alloc(0), {}, 100, 1024);
    const rejection = expect(task).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledOnce();
    exitChild(null, 'SIGKILL');
    await rejection;
  });

  it('terminates and cleans up after successful output as well', async () => {
    child.kill.mockImplementation(() => {
      queueMicrotask(() => exitChild(null, 'SIGKILL'));
      return true;
    });
    const task = renderImageInProcess(Buffer.alloc(0), {}, 100, 1024);
    child.emit('message', {
      result: { data: Buffer.from([1, 2]), format: 'png', width: 1, height: 1, summary: {} }
    });
    expect(await task).toMatchObject({ data: Buffer.from([1, 2]) });
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
