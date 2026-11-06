declare module 'openscad-wasm' {
  export interface InitOptions {
    noInitialRun?: boolean;
    noExitRuntime?: boolean;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }

  export interface WasmFs {
    mkdir(path: string): void;
    stat(path: string): unknown;
    readFile(path: string): string | Uint8Array;
    readFile(path: string, opts: { encoding: 'utf8' }): string;
    readFile(path: string, opts: { encoding: 'binary' }): Uint8Array;
    writeFile(path: string, data: string | ArrayBufferView): void;
    unlink(path: string): void;
  }

  export interface OpenSCAD {
    callMain(args: string[]): number;
    FS: WasmFs;
  }

  export type FS = WasmFs;

  export interface OpenSCADInstance {
    renderToStl(code: string): Promise<string>;
    getInstance(): OpenSCAD;
  }

  export function createOpenSCAD(options?: InitOptions): Promise<OpenSCADInstance>;
}
