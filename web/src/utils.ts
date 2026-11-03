export type AbortablePromise<T> = Promise<T> & {kill: () => void};
export function AbortablePromise<T>(run: (resolve: (value: T) => void, reject: (error: any) => void) => () => void): AbortablePromise<T> {
  let kill: () => void;
  return Object.assign(new Promise<T>((resolve, reject) => { kill = run(resolve, reject); }), {kill: () => kill?.()});
}

export function turnIntoDelayableExecution<T extends any[], R>(delay: number, run: (...args: T) => AbortablePromise<R>) {
  let timer: number | undefined;
  let running: AbortablePromise<R> | undefined;
  return (...args: T) => ({now}: {now: boolean}) => AbortablePromise<R>((resolve, reject) => {
    clearTimeout(timer);
    const execute = () => {
      running?.kill();
      running = run(...args);
      running.then(resolve, reject);
    };
    if (now) execute(); else timer = window.setTimeout(execute, delay);
    return () => { clearTimeout(timer); running?.kill(); };
  });
}

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
