import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertWithinBytes, DEFAULT_ALLOWED_EXTENSIONS } from '../security/limits.js';
import type { FileInputContent } from '../openscad/OpenScadRunner.js';
import { relativePosixPath, type WorkspacePaths } from './paths.js';
import { resolveSafePath } from './safePaths.js';

export interface WorkspaceFileInfo {
  path: string;
  sizeBytes: number;
  modifiedMs: number;
}

export interface ResolvedModelInput {
  scad: string;
  sourcePath: string;
  files: Record<string, FileInputContent>;
}

const SCAD_EXTENSIONS = new Set(['.scad']);
const STAGED_EXTENSIONS = new Set([
  '.scad',
  '.stl',
  '.off',
  '.3mf',
  '.dxf',
  '.svg',
  '.json',
  '.txt',
  '.dat',
  '.ttf',
  '.otf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp'
]);
const TEXT_EXTENSIONS = new Set(['.scad', '.json', '.txt', '.svg', '.dxf']);
const EXCLUDED_DIRECTORIES = new Set(['.git', '.tmp', 'node_modules']);
const MAX_STAGED_FILES = 200;

export class WorkspaceManager {
  constructor(private readonly paths: WorkspacePaths) {}

  async init(): Promise<void> {
    await mkdir(this.paths.workspaceDir, { recursive: true });
  }

  async resolveModelInput(input: {
    path?: string;
    scad?: string;
    files?: Record<string, FileInputContent>;
    maxInputBytes: number;
  }): Promise<ResolvedModelInput> {
    if (input.path && input.scad !== undefined) {
      throw new Error('Provide either path or scad, not both.');
    }
    if (!input.path && input.scad === undefined) {
      throw new Error('Provide a workspace path or inline scad source.');
    }

    if (input.scad !== undefined) {
      assertWithinBytes(
        'SCAD input',
        Buffer.byteLength(input.scad, 'utf8'),
        input.maxInputBytes
      );
      return {
        scad: input.scad,
        sourcePath: 'input.scad',
        files: input.files ?? {}
      };
    }

    const workspaceRoot = await realpath(this.paths.workspaceDir);
    const sourceAbsolute = await resolveSafePath(this.paths.workspaceDir, input.path!, {
      allowedExtensions: SCAD_EXTENSIONS,
      mustExist: true
    });
    const sourceStats = await stat(sourceAbsolute);
    if (!sourceStats.isFile()) {
      throw new Error('The model path must point to a SCAD file.');
    }
    assertWithinBytes('SCAD input', sourceStats.size, input.maxInputBytes);

    const sourcePath = relativePosixPath(workspaceRoot, sourceAbsolute);
    const staged = await this.stageModelDirectory(
      path.dirname(sourceAbsolute),
      sourcePath,
      input.maxInputBytes
    );

    return {
      scad: await readFile(sourceAbsolute, 'utf8'),
      sourcePath,
      files: { ...staged, ...(input.files ?? {}) }
    };
  }

  async listFiles(relativePath = '.'): Promise<WorkspaceFileInfo[]> {
    const workspaceRoot = await realpath(this.paths.workspaceDir);
    const root = await resolveSafePath(this.paths.workspaceDir, relativePath || '.', {
      allowDirectory: true,
      mustExist: true
    });
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) {
      return [
        {
          path: relativePosixPath(workspaceRoot, root),
          sizeBytes: rootStats.size,
          modifiedMs: rootStats.mtimeMs
        }
      ];
    }

    return this.walkFiles(root, workspaceRoot);
  }

  async readWorkspaceFile(relativePath: string): Promise<{ content: string; sizeBytes: number }> {
    const target = await resolveSafePath(this.paths.workspaceDir, relativePath, {
      allowedExtensions: DEFAULT_ALLOWED_EXTENSIONS,
      mustExist: true
    });
    const data = await readFile(target);
    return {
      content: data.toString('utf8'),
      sizeBytes: data.byteLength
    };
  }

  async writeWorkspaceFile(input: {
    path: string;
    content: string;
    maxInputBytes: number;
  }): Promise<WorkspaceFileInfo> {
    return this.writeWorkspaceBinary({
      path: input.path,
      data: Buffer.from(input.content, 'utf8'),
      maxBytes: input.maxInputBytes
    });
  }

  async writeWorkspaceBinary(input: {
    path: string;
    data: Buffer;
    maxBytes: number;
    allowedExtensions?: Set<string>;
  }): Promise<WorkspaceFileInfo> {
    assertWithinBytes(`File ${input.path}`, input.data.byteLength, input.maxBytes);
    const target = await resolveSafePath(this.paths.workspaceDir, input.path, {
      allowedExtensions: input.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS,
      createParent: true
    });
    await writeFile(target, input.data);
    const fileStats = await stat(target);
    const workspaceRoot = await realpath(this.paths.workspaceDir);
    return {
      path: relativePosixPath(workspaceRoot, target),
      sizeBytes: fileStats.size,
      modifiedMs: fileStats.mtimeMs
    };
  }

  async deleteWorkspaceFile(relativePath: string): Promise<{ deleted: boolean }> {
    const target = await resolveSafePath(this.paths.workspaceDir, relativePath, {
      allowedExtensions: DEFAULT_ALLOWED_EXTENSIONS,
      mustExist: true
    });
    const targetStats = await stat(target);
    if (targetStats.isDirectory()) {
      throw new Error('Deleting directories is not supported by this tool.');
    }
    await rm(target, { force: false });
    return { deleted: true };
  }

  private async walkFiles(root: string, workspaceRoot: string): Promise<WorkspaceFileInfo[]> {
    const files: WorkspaceFileInfo[] = [];
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        files.push(...(await this.walkFiles(fullPath, workspaceRoot)));
      } else if (entry.isFile()) {
        const fileStats = await stat(fullPath);
        files.push({
          path: relativePosixPath(workspaceRoot, fullPath),
          sizeBytes: fileStats.size,
          modifiedMs: fileStats.mtimeMs
        });
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async stageModelDirectory(
    directory: string,
    sourcePath: string,
    maxInputBytes: number
  ): Promise<Record<string, FileInputContent>> {
    const workspaceRoot = await realpath(this.paths.workspaceDir);
    const files: Record<string, FileInputContent> = {};
    let totalBytes = 0;
    let count = 0;
    const totalLimit = Math.min(maxInputBytes * 8, 128 * 1024 * 1024);

    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (count >= MAX_STAGED_FILES || totalBytes >= totalLimit) {
          return;
        }
        if (entry.isSymbolicLink()) {
          continue;
        }
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRECTORIES.has(entry.name)) {
            continue;
          }
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile() || entry.name.startsWith('job-')) {
          continue;
        }
        const extension = path.extname(entry.name).toLowerCase();
        if (!STAGED_EXTENSIONS.has(extension)) {
          continue;
        }
        const relativePath = relativePosixPath(workspaceRoot, fullPath);
        if (relativePath === sourcePath) {
          continue;
        }
        const fileStats = await stat(fullPath);
        if (fileStats.size > maxInputBytes || totalBytes + fileStats.size > totalLimit) {
          continue;
        }
        const data = await readFile(fullPath);
        files[relativePath] = TEXT_EXTENSIONS.has(extension)
          ? data.toString('utf8')
          : { contentBase64: data.toString('base64') };
        totalBytes += data.byteLength;
        count += 1;
      }
    };

    await walk(directory);
    return files;
  }
}
