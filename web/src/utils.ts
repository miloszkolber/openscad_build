export type AbortablePromise<T> = Promise<T> & {kill: () => void};
export function AbortablePromise<T>(run: (resolve: (value: T) => void, reject: (error: any) => void) => () => void): AbortablePromise<T> {
  let cleanup: (() => void) | undefined;
  let rejectPromise: (error: Error) => void;
  let settled = false;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    cleanup = run(value => { settled = true; resolve(value); }, error => { settled = true; reject(error); });
  });
  return Object.assign(promise, {kill: () => {
    if (settled) return;
    settled = true;
    cleanup?.();
    rejectPromise(new Error('OpenSCAD operation cancelled.'));
  }});
}

export function turnIntoDelayableExecution<T extends any[], R>(delay: number, run: (...args: T) => AbortablePromise<R>) {
  let pending: AbortablePromise<R> | undefined;
  return (...args: T) => ({now}: {now: boolean}) => {
    pending?.kill();
    pending = AbortablePromise<R>((resolve, reject) => {
      let running: AbortablePromise<R> | undefined;
      let timer: number | undefined;
      const execute = () => {
        try { running = run(...args); running.then(resolve, reject); }
        catch (error) { reject(error); }
      };
      if (now) execute(); else timer = window.setTimeout(execute, delay);
      return () => { clearTimeout(timer); running?.kill(); };
    });
    return pending;
  };
}

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
