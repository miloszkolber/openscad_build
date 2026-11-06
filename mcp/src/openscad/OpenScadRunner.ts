import type { DefineValue } from './args.js';
import type { ExportFormat } from './formats.js';
import type { Diagnostic } from '../types/toolResults.js';

export type FileInputContent = string | { base64: string } | { contentBase64: string };

export interface OpenScadBaseInput {
  sourcePath: string;
  scad: string;
  files?: Record<string, FileInputContent>;
  defines?: Record<string, DefineValue>;
  enableManifold?: boolean;
  timeoutMs?: number;
}

export type OpenScadValidateInput = OpenScadBaseInput;

export interface OpenScadExportInput extends OpenScadBaseInput {
  format: ExportFormat;
  summaryFile?: boolean;
}

export interface OpenScadRunResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

export interface OpenScadExportResult extends OpenScadRunResult {
  format: ExportFormat;
  filename: string;
  data: Buffer;
  summary?: unknown;
}

export interface OpenScadRunner {
  validate(input: OpenScadValidateInput, signal?: AbortSignal): Promise<OpenScadRunResult>;
  export(input: OpenScadExportInput, signal?: AbortSignal): Promise<OpenScadExportResult>;
}
