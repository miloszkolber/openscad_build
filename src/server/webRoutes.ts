import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import type { AppConfig } from '../config.js';
import { assertSafeRelativePath } from '../security/sanitize.js';
import { resolveSafePath } from '../workspace/safePaths.js';

const EXCLUDED_DIRECTORIES = new Set(['.git', '.tmp', 'node_modules']);
const BROWSER_EXTENSIONS = new Set([
  '.scad',
  '.stl',
  '.off',
  '.3mf',
  '.dxf',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.dat',
  '.json',
  '.txt',
  '.ttf',
  '.otf'
]);
const SCAD_MIME_TYPE = 'application/x-openscad';

type FileIndex = { [name: string]: FileIndex | null };

export function registerWebRoutes(app: Express, config: AppConfig): void {
  app.get('/healthz', async (_req: Request, res: Response) => {
    try {
      const workspaceStats = await stat(config.paths.workspaceDir);
      if (!workspaceStats.isDirectory()) {
        throw new Error('Workspace is not a directory.');
      }
      await readdir(config.paths.workspaceDir);
      res.json({ ok: true, name: 'openscad-wasm-mcp' });
    } catch {
      res.status(503).json({ ok: false, name: 'openscad-wasm-mcp' });
    }
  });

  app.get('/api/files', async (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await buildFileIndex(config.paths.workspaceDir));
    } catch {
      res.status(503).type('text/plain').send('Cannot list the model directory.');
    }
  });

  app.use('/models', async (req: Request, res: Response) => {
    const relativePath = decodeModelPath(req.path);
    if (!relativePath) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }

    try {
      assertSafeRelativePath(relativePath);
      const parts = relativePath.split('/').filter(Boolean);
      if (
        parts.length === 0 ||
        parts.some((part) => EXCLUDED_DIRECTORIES.has(part)) ||
        parts[parts.length - 1]!.startsWith('job-')
      ) {
        throw new Error('Excluded path.');
      }
      const extension = path.extname(relativePath).toLowerCase();
      if (!BROWSER_EXTENSIONS.has(extension)) {
        throw new Error('Excluded extension.');
      }

      const workspaceRoot = await realpath(config.paths.workspaceDir);
      await assertNoSymlinkComponents(workspaceRoot, parts);
      const absolutePath = await resolveSafePath(config.paths.workspaceDir, relativePath, {
        allowedExtensions: BROWSER_EXTENSIONS,
        mustExist: true
      });

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (extension === '.scad') {
        res.type(SCAD_MIME_TYPE);
      }
      res.sendFile(absolutePath, (error) => {
        if (error && !res.headersSent) {
          res.status(404).type('text/plain').send('Not found.');
        }
      });
    } catch {
      res.status(404).type('text/plain').send('Not found.');
    }
  });

  app.use(
    express.static(config.webDir, {
      index: 'index.html',
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
    })
  );

  app.get('/', (_req: Request, res: Response) => {
    res
      .status(503)
      .type('text/plain')
      .send('The OpenSCAD browser UI is not built. Run npm run prepare:assets && npm run build:web.');
  });
}

export async function buildFileIndex(root: string): Promise<FileIndex> {
  const index: FileIndex = {};
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));

  for (const entry of entries) {
    if (EXCLUDED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      index[entry.name] = await buildFileIndex(path.join(root, entry.name));
    } else if (
      entry.isFile() &&
      BROWSER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
      !entry.name.startsWith('job-')
    ) {
      index[entry.name] = null;
    }
  }

  return index;
}

function decodeModelPath(requestPath: string): string | undefined {
  try {
    const decoded = decodeURIComponent(requestPath.replace(/^\/+/, ''));
    if (!decoded || decoded.includes('\0')) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
}

async function assertNoSymlinkComponents(root: string, parts: string[]): Promise<void> {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error('Symlinks are not served.');
    }
  }
}
