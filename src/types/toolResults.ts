export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface OutputMetadata {
  path: string;
  filename: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ToolRunResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

export interface ExportToolResult extends ToolRunResult {
  output?: OutputMetadata;
}

export interface AnalyzeSummary {
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  triangleCount?: number;
}

export interface AnalyzeToolResult extends ToolRunResult {
  summary: AnalyzeSummary;
}

export interface ImageMetadata {
  format: 'png' | 'webp';
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ScreenshotToolResult extends ToolRunResult {
  summary: AnalyzeSummary;
  image?: ImageMetadata;
  imageData?: Buffer;
  output?: OutputMetadata;
}
