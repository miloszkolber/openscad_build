interface FS {
  readdirSync(path: string): string[];
  readFileSync(path: string): BufferSource;
}

declare const BrowserFS: {
  EmscriptenFS: any;
  BFSRequire(module: string): any;
  install(target: any): void;
  configure(options: any, callback: (error?: Error) => void): void;
};
