import { describe, expect, it } from 'vitest';
import { parseDiagnostics } from '../src/openscad/parseDiagnostics.js';

describe('parseDiagnostics', () => {
  it('extracts warnings, errors, and locations', () => {
    const diagnostics = parseDiagnostics(
      'ECHO: version = 1',
      [
        'WARNING: Ignoring unknown variable in file input.scad, line 2',
        'ERROR: Parser error: syntax error in file input.scad, line 4, column 7'
      ].join('\n')
    );

    expect(diagnostics).toEqual([
      { level: 'info', message: 'version = 1' },
      {
        level: 'warning',
        message: 'Ignoring unknown variable in file input.scad, line 2',
        file: 'input.scad',
        line: 2,
        column: undefined
      },
      {
        level: 'error',
        message: 'Parser error: syntax error in file input.scad, line 4, column 7',
        file: 'input.scad',
        line: 4,
        column: 7
      }
    ]);
  });
});
