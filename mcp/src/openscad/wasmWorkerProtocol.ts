import type {
  OpenScadExportInput,
  OpenScadExportResult,
  OpenScadRunResult,
  OpenScadValidateInput
} from './OpenScadRunner.js';

export type WasmWorkerRequest =
  | { operation: 'validate'; input: OpenScadValidateInput }
  | { operation: 'export'; input: OpenScadExportInput };

export type WasmWorkerResult = OpenScadRunResult | OpenScadExportResult;

export interface SerializedWorkerError {
  name: string;
  message: string;
  stack?: string;
}

export type WasmWorkerResponse =
  { success: true; result: WasmWorkerResult } | { success: false; error: SerializedWorkerError };
