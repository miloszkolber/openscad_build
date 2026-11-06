import type { Diagnostic, DiagnosticLevel } from '../types/toolResults.js';

const LEVEL_PATTERN = /\b(ERROR|WARNING|DEPRECATED|TRACE|ECHO):\s*(.*)$/i;
const LOCATION_PATTERNS = [
  /\bfile\s+([^,\s]+),\s*line\s+(\d+)(?:,\s*column\s+(\d+))?/i,
  /\bat\s+([^:\s]+):(\d+)(?::(\d+))?/i
];

export function parseDiagnostics(stdout = '', stderr = ''): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const rawLine of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = LEVEL_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const level = diagnosticLevel(match[1]);
    const message = match[2]?.trim() || line;
    const location = parseLocation(line);
    const key = `${level}:${message}:${location.file ?? ''}:${location.line ?? ''}`;

    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push({ level, message, ...location });
    }
  }

  return diagnostics;
}

function diagnosticLevel(value: string): DiagnosticLevel {
  const normalized = value.toLowerCase();
  if (normalized === 'error') {
    return 'error';
  }
  if (normalized === 'warning' || normalized === 'deprecated') {
    return 'warning';
  }
  return 'info';
}

function parseLocation(line: string): Pick<Diagnostic, 'file' | 'line' | 'column'> {
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      return {
        file: match[1],
        line: match[2] ? Number(match[2]) : undefined,
        column: match[3] ? Number(match[3]) : undefined
      };
    }
  }
  return {};
}
