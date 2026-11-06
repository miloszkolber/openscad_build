import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('site assets and compose download links', () => {
  const rootDir = resolve(__dirname, '..');
  const siteDir = resolve(rootDir, 'site');

  it('ensures site/docker-compose.yml matches docker-compose_prebuilt.yml', () => {
    const prebuiltCompose = readFileSync(resolve(rootDir, 'docker-compose_prebuilt.yml'), 'utf-8');
    const siteCompose = readFileSync(resolve(siteDir, 'docker-compose.yml'), 'utf-8');
    expect(siteCompose).toBe(prebuiltCompose);
    expect(prebuiltCompose).toContain('${OPENSCAD_IMAGE:-ghcr.io/miloszkolber/openscad-mcp:latest}');
    expect(prebuiltCompose).not.toContain('image: ghcr.io/suapapa/openscad-wasm-mcp:latest');
  });

  it('ensures site/.env.example matches root .env.example', () => {
    const rootEnv = readFileSync(resolve(rootDir, '.env.example'), 'utf-8');
    const siteEnv = readFileSync(resolve(siteDir, '.env.example'), 'utf-8');
    expect(siteEnv).toBe(rootEnv);
  });

  it('verifies site/index.html has download links for compose and env example', () => {
    const indexHtml = readFileSync(resolve(siteDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('href="./docker-compose.yml"');
    expect(indexHtml).toContain('download="docker-compose.yml"');
    expect(indexHtml).toContain('href="./.env.example"');
    expect(indexHtml).toContain('download=".env.example"');
    expect(indexHtml).toContain('data-i18n="start.download.compose"');
    expect(indexHtml).toContain('data-i18n="start.download.env"');
  });

  it('verifies i18n translations include download keys for all supported languages', async () => {
    // @ts-expect-error Untyped browser module
    const { SUPPORTED, t } = (await import('../site/js/i18n.js')) as {
      SUPPORTED: string[];
      t: (lang: string, key: string) => string;
    };
    for (const lang of SUPPORTED) {
      const composeText = t(lang, 'start.download.compose');
      const envText = t(lang, 'start.download.env');
      expect(composeText).toBeTruthy();
      expect(composeText).not.toBe('start.download.compose');
      expect(envText).toBeTruthy();
      expect(envText).not.toBe('start.download.env');
    }
  });

  it('verifies site/index.html links to repository README in start note', () => {
    const indexHtml = readFileSync(resolve(siteDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('data-i18n-html="start.note"');
    expect(indexHtml).toContain('href="https://github.com/miloszkolber/openscad_build#readme"');
  });

  it('verifies start.note includes README link and mentions Hermes in all supported languages', async () => {
    // @ts-expect-error Untyped browser module
    const { SUPPORTED, t } = (await import('../site/js/i18n.js')) as {
      SUPPORTED: string[];
      t: (lang: string, key: string) => string;
    };
    for (const lang of SUPPORTED) {
      const title = t(lang, 'start.title');
      expect(title).toBeTruthy();
      expect(title).not.toBe('start.title');
      const noteHtml = t(lang, 'start.note');
      expect(noteHtml).toContain('href="https://github.com/miloszkolber/openscad_build#readme"');
      expect(noteHtml).toContain('>README</a>');
      expect(noteHtml).toContain('Hermes');
    }
  });

  it('ensures start panel header and note do not have restrictive max-width in styles.css', () => {
    const css = readFileSync(resolve(siteDir, 'css/styles.css'), 'utf-8');
    expect(css).toMatch(/\.start-panel \.section-head\s*\{[^}]*max-width:\s*none/);
    expect(css).toMatch(/\.start-note\s*\{[^}]*max-width:\s*none/);
  });
});
