export const EXPORT_FORMATS = ['stl', '3mf', 'off', 'csg', 'dxf', 'svg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  stl: '.stl',
  '3mf': '.3mf',
  off: '.off',
  csg: '.csg',
  dxf: '.dxf',
  svg: '.svg'
};

export const FORMAT_MIME_TYPES: Record<ExportFormat, string> = {
  stl: 'model/stl',
  '3mf': 'model/3mf',
  off: 'application/octet-stream',
  csg: 'text/plain',
  dxf: 'image/vnd.dxf',
  svg: 'image/svg+xml'
};

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function extensionForFormat(format: ExportFormat): string {
  return FORMAT_EXTENSIONS[format];
}

export function mimeTypeForFormat(format: ExportFormat): string {
  return FORMAT_MIME_TYPES[format];
}
