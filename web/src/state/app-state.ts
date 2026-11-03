import {ParameterSet} from './customizer-types';

export type Source = {path: string, content?: string};
export type SourceMode = 'mounted' | 'paste';
export interface State {
  params: {activePath: string, sources: Source[], vars?: {[name: string]: any}, mode?: SourceMode};
  currentRunLogs?: ['stderr' | 'stdout', string][];
  parameterSet?: ParameterSet;
  checkingSyntax?: boolean;
  previewing?: boolean;
  rendering?: boolean;
  exporting?: boolean;
  error?: string;
  output?: {isPreview: boolean, outFileURL: string, displayFileURL: string};
}
