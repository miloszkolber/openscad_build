import { parentPort, workerData } from 'node:worker_threads';
import { createOpenSCAD, type OpenSCAD, type WasmFs } from 'openscad-wasm';
import { assertSafeRelativePath } from '../security/sanitize.js';
import { decodeFileContent } from './fileContent.js';
import { buildOpenScadArgs } from './args.js';
import { extensionForFormat } from './formats.js';
import {
  type FileInputContent,
  type OpenScadBaseInput,
  type OpenScadExportInput,
  type OpenScadExportResult,
  type OpenScadRunResult,
  type OpenScadValidateInput
} from './OpenScadRunner.js';
import { parseDiagnostics } from './parseDiagnostics.js';
import type {
  SerializedWorkerError,
  WasmWorkerRequest,
  WasmWorkerResponse
} from './wasmWorkerProtocol.js';

interface WasmContext {
  openscad: OpenSCAD;
  virtualRoot: string;
  stdout: string[];
  stderr: string[];
}

interface CallMainResult {
  exitCode: number;
  thrown?: string;
}

async function main(): Promise<void> {
  const response = await runWorkerRequest(workerData as WasmWorkerRequest);
  parentPort?.postMessage(response);
}

async function runWorkerRequest(request: WasmWorkerRequest): Promise<WasmWorkerResponse> {
  const started = performance.now();
  try {
    const result = await executeRequest(request);
    return {
      success: true,
      result: {
        ...result,
        elapsedMs: Math.round(performance.now() - started)
      }
    };
  } catch (error) {
    return {
      success: false,
      error: serializeError(error)
    };
  }
}

async function executeRequest(request: WasmWorkerRequest): Promise<OpenScadRunResult> {
  switch (request.operation) {
    case 'validate':
      return runValidate(request.input);
    case 'export':
      return runExport(request.input);
  }
}

async function createContext(input: OpenScadBaseInput): Promise<WasmContext> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const api = await createOpenSCAD({
    noInitialRun: true,
    noExitRuntime: true,
    print: (text) => stdout.push(text),
    printErr: (text) => stderr.push(text)
  });

  const openscad = api.getInstance();
  const virtualRoot = '/job';
  ensureWasmDir(openscad.FS, virtualRoot);
  writeWasmInputs(
    openscad.FS,
    virtualRoot,
    input.sourcePath,
    input.scad,
    input.files ?? {}
  );

  return { openscad, virtualRoot, stdout, stderr };
}

async function runValidate(input: OpenScadValidateInput): Promise<OpenScadRunResult> {
  const context = await createContext(input);
  const outputPath = `${context.virtualRoot}/validation.csg`;
  const args = buildOpenScadArgs({
    inputPath: `${context.virtualRoot}/${input.sourcePath}`,
    outputPath,
    format: 'csg',
    defines: input.defines,
    enableManifold: input.enableManifold
  });

  const call = callMain(context.openscad, args);
  if (call.exitCode !== 0 || call.thrown) {
    return wasmRunFailure(context, describeFailure('validate OpenSCAD source', call));
  }

  return wasmRunSuccess(context);
}

async function runExport(input: OpenScadExportInput): Promise<OpenScadExportResult> {
  const context = await createContext(input);
  const filename = `output${extensionForFormat(input.format)}`;
  const outputPath = `${context.virtualRoot}/${filename}`;
  const summaryPath = input.summaryFile ? `${context.virtualRoot}/summary.json` : undefined;
  const args = buildOpenScadArgs({
    inputPath: `${context.virtualRoot}/${input.sourcePath}`,
    outputPath,
    format: input.format,
    defines: input.defines,
    enableManifold: input.enableManifold,
    summaryFilePath: summaryPath
  });

  const call = callMain(context.openscad, args);
  if (call.exitCode !== 0 || call.thrown) {
    return wasmExportFailure(
      context,
      input.format,
      filename,
      describeFailure(`export ${input.format}`, call)
    );
  }

  const output = readOutput(context, outputPath);
  if (!output) {
    return wasmExportFailure(
      context,
      input.format,
      filename,
      `OpenSCAD WASM reported success but did not produce ${filename}.`
    );
  }

  return {
    ...wasmRunSuccess(context),
    format: input.format,
    filename,
    data: output,
    summary: readSummary(context, summaryPath)
  };
}

function callMain(openscad: OpenSCAD, args: string[]): CallMainResult {
  try {
    return { exitCode: openscad.callMain(args) };
  } catch (error) {
    return { exitCode: 1, thrown: stringifyWasmError(error) };
  }
}

function wasmRunSuccess(context: WasmContext): OpenScadRunResult {
  return {
    ok: true,
    diagnostics: parseDiagnostics(context.stdout.join('\n'), context.stderr.join('\n')),
    stdout: context.stdout.join('\n'),
    stderr: context.stderr.join('\n'),
    elapsedMs: 0
  };
}

function wasmRunFailure(context: WasmContext, message: string): OpenScadRunResult {
  const diagnostics = parseDiagnostics(context.stdout.join('\n'), context.stderr.join('\n'));
  diagnostics.push({ level: 'error', message });

  return {
    ok: false,
    diagnostics,
    stdout: context.stdout.join('\n'),
    stderr: appendMessage(context.stderr.join('\n'), message),
    elapsedMs: 0
  };
}

function wasmExportFailure(
  context: WasmContext,
  format: OpenScadExportResult['format'],
  filename: string,
  message: string
): OpenScadExportResult {
  return {
    ...wasmRunFailure(context, message),
    format,
    filename,
    data: Buffer.alloc(0)
  };
}

function describeFailure(action: string, call: CallMainResult): string {
  if (call.thrown) {
    return `OpenSCAD WASM failed to ${action}: ${call.thrown}.`;
  }
  return `OpenSCAD WASM failed to ${action}: exit code ${call.exitCode}.`;
}

function readOutput(context: WasmContext, outputPath: string): Buffer | undefined {
  try {
    const output = context.openscad.FS.readFile(outputPath, { encoding: 'binary' });
    return Buffer.from(output);
  } catch {
    return undefined;
  }
}

function readSummary(context: WasmContext, summaryPath: string | undefined): unknown {
  if (!summaryPath) {
    return undefined;
  }

  try {
    const summary = context.openscad.FS.readFile(summaryPath, { encoding: 'utf8' });
    return JSON.parse(summary);
  } catch (error) {
    context.stderr.push(
      `WARNING: OpenSCAD summary-file output could not be read: ${stringifyWasmError(error)}`
    );
    return undefined;
  }
}

function writeWasmInputs(
  fs: WasmFs,
  virtualRoot: string,
  sourcePath: string,
  scad: string,
  files: Record<string, FileInputContent>
): void {
  assertSafeRelativePath(sourcePath);
  const sourceParts = sourcePath.split('/').filter(Boolean);
  let sourceDirectory = virtualRoot;
  for (const dir of sourceParts.slice(0, -1)) {
    sourceDirectory = `${sourceDirectory}/${dir}`;
    ensureWasmDir(fs, sourceDirectory);
  }
  fs.writeFile(`${virtualRoot}/${sourcePath}`, scad);

  for (const [requestedPath, contents] of Object.entries(files)) {
    assertSafeRelativePath(requestedPath);
    const parts = requestedPath.split('/').filter(Boolean);
    let current = virtualRoot;
    for (const dir of parts.slice(0, -1)) {
      current = `${current}/${dir}`;
      ensureWasmDir(fs, current);
    }
    fs.writeFile(`${virtualRoot}/${requestedPath}`, decodeFileContent(contents));
  }
}

function ensureWasmDir(fs: WasmFs, dir: string): void {
  const parts = dir.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = `${current}/${part}`;
    try {
      fs.stat(current);
    } catch {
      fs.mkdir(current);
    }
  }
}

function appendMessage(stderr: string, message: string): string {
  return stderr.length > 0 ? `${stderr}\n${message}` : message;
}

function stringifyWasmError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'number') {
    return `thrown status ${error}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

function serializeError(error: unknown): SerializedWorkerError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: 'Error',
    message: stringifyWasmError(error)
  };
}

await main();
