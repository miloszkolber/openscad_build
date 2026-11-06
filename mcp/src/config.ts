import path from 'node:path';
import * as z from 'zod/v4';
import { mbToBytes, type LimitConfig } from './security/limits.js';
import type { WorkspacePaths } from './workspace/paths.js';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  WORKSPACE_DIR: z.string().default('/workspace'),
  WEB_DIR: z.string().optional(),
  MAX_RENDER_MS: z.coerce.number().int().positive().default(30_000),
  MAX_OUTPUT_MB: z.coerce.number().positive().default(50),
  MAX_INPUT_MB: z.coerce.number().positive().default(50),
  MAX_PARALLEL_JOBS: z.coerce.number().int().positive().default(2),
  OPENSCAD_BACKEND: z.enum(['wasm', 'mock']).default('wasm'),
  MCP_AUTH_TOKEN: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    })
});

export interface AppConfig {
  port: number;
  host: string;
  backend: 'wasm' | 'mock';
  mcpAuthToken?: string;
  paths: WorkspacePaths;
  limits: LimitConfig;
  webDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const workspaceDir = path.resolve(parsed.WORKSPACE_DIR);
  const webDir = path.resolve(
    parsed.WEB_DIR?.trim() || path.resolve(import.meta.dirname, '../../web/dist')
  );

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    backend: parsed.OPENSCAD_BACKEND,
    mcpAuthToken: parsed.MCP_AUTH_TOKEN,
    paths: {
      workspaceDir
    },
    limits: {
      maxRenderMs: parsed.MAX_RENDER_MS,
      maxOutputBytes: mbToBytes(parsed.MAX_OUTPUT_MB),
      maxInputBytes: mbToBytes(parsed.MAX_INPUT_MB),
      maxParallelJobs: parsed.MAX_PARALLEL_JOBS
    },
    webDir
  };
}
