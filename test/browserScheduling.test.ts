/// <reference lib="dom" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbortablePromise, turnIntoDelayableExecution } from '../web/src/utils.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser render scheduling', () => {
  it('rejects superseded debounce work instead of leaving it pending forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const calls: number[] = [];
    const render = turnIntoDelayableExecution(100, (value: number) =>
      AbortablePromise<number>((resolve) => {
        calls.push(value);
        resolve(value);
        return () => {};
      })
    );
    const first = render(1)({ now: false });
    const rejected = expect(first).rejects.toThrow(/cancelled/);
    const second = render(2)({ now: false });
    await rejected;
    await vi.advanceTimersByTimeAsync(100);
    expect(await second).toBe(2);
    expect(calls).toEqual([2]);
  });

  it('terminates an active render immediately when a replacement is requested', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const kill = vi.fn();
    const render = turnIntoDelayableExecution(100, () => AbortablePromise<number>(() => kill));
    const first = render()({ now: true });
    const firstRejection = expect(first).rejects.toThrow(/cancelled/);
    const second = render()({ now: false });
    const secondRejection = expect(second).rejects.toThrow(/cancelled/);
    expect(kill).toHaveBeenCalledOnce();
    second.kill();
    await Promise.all([firstRejection, secondRejection]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
