import * as z from 'zod/v4';
import { attachStlPreviewLink } from '../preview/attachPreviewLink.js';
import type { AnalyzeToolResult } from '../types/toolResults.js';
import type { ToolDependencies } from './index.js';
import { definesSchema, filesSchema } from './validate.js';
import { errorRunResult } from './toolResponse.js';

export const analyzeModelInputSchema = z.object({
  scad: z.string().min(1),
  files: filesSchema.optional(),
  defines: definesSchema.optional(),
  enableManifold: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export type AnalyzeModelInput = z.infer<typeof analyzeModelInputSchema>;

export async function handleAnalyzeModel(
  rawInput: unknown,
  deps: ToolDependencies
): Promise<AnalyzeToolResult> {
  const started = performance.now();
  try {
    const input = analyzeModelInputSchema.parse(rawInput);
    const job = await deps.workspace.createJob();
    try {
      await deps.workspace.writeJobInputs({
        job,
        scad: input.scad,
        files: input.files,
        maxInputBytes: deps.config.limits.maxInputBytes
      });

      const result = await deps.semaphore.run(
        () =>
          deps.runner.export(
            {
              ...input,
              format: 'stl',
              summaryFile: true,
              jobId: job.id,
              jobDir: job.dir,
              timeoutMs: input.timeoutMs ?? deps.config.limits.maxRenderMs
            },
            deps.signal
          ),
        deps.signal
      );

      if (!result.ok) {
        return {
          ok: false,
          summary: {},
          diagnostics: result.diagnostics,
          stdout: result.stdout,
          stderr: result.stderr,
          elapsedMs: result.elapsedMs
        };
      }

      const artifact = await deps.artifacts.saveArtifact({
        jobId: job.id,
        suffix: result.filename,
        format: result.format,
        data: result.data
      });
      const geometry = mergeGeometry(
        parseStlGeometry(result.data),
        geometryFromOpenScadSummary(result.summary)
      );
      const preview = await attachStlPreviewLink(deps, artifact, {
        scad: input.scad,
        jobId: job.id
      });

      return {
        ok: true,
        summary: {
          ...geometry,
          artifact
        },
        ...preview,
        diagnostics: result.diagnostics,
        stdout: result.stdout,
        stderr: result.stderr,
        elapsedMs: result.elapsedMs
      };
    } finally {
      await deps.workspace.cleanupJob(job, deps.config.limits.cleanupJobs);
    }
  } catch (error) {
    return {
      ...errorRunResult(error, Math.round(performance.now() - started)),
      summary: {}
    };
  }
}

export function parseStlGeometry(data: Buffer): {
  boundingBox?: { min: [number, number, number]; max: [number, number, number] };
  triangleCount?: number;
} {
  const binary = parseBinaryStl(data);
  if (binary) {
    return binary;
  }
  return parseAsciiStl(data.toString('utf8'));
}

function parseBinaryStl(data: Buffer): ReturnType<typeof parseStlGeometry> | undefined {
  if (data.byteLength < 84) {
    return undefined;
  }

  const triangleCount = data.readUInt32LE(80);
  if (84 + triangleCount * 50 !== data.byteLength) {
    return undefined;
  }

  const bounds = createBounds();
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    offset += 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      bounds.add([
        data.readFloatLE(offset),
        data.readFloatLE(offset + 4),
        data.readFloatLE(offset + 8)
      ]);
      offset += 12;
    }
    offset += 2;
  }

  return {
    triangleCount,
    boundingBox: bounds.value()
  };
}

export function geometryFromOpenScadSummary(summary: unknown): {
  boundingBox?: { min: [number, number, number]; max: [number, number, number] };
  triangleCount?: number;
} {
  if (!summary || typeof summary !== 'object') {
    return {};
  }

  const geometry = (summary as { geometry?: unknown }).geometry;
  if (!geometry || typeof geometry !== 'object') {
    return {};
  }

  const boundingBox = parseSummaryBoundingBox(
    (geometry as { bounding_box?: unknown }).bounding_box
  );
  const facets = (geometry as { facets?: unknown }).facets;
  const triangles = (geometry as { triangles?: unknown }).triangles;
  const triangular = (geometry as { triangular?: unknown }).triangular;
  const triangleCount =
    typeof triangles === 'number' && Number.isFinite(triangles)
      ? triangles
      : triangular === true && typeof facets === 'number' && Number.isFinite(facets)
        ? facets
        : undefined;

  return {
    boundingBox,
    triangleCount
  };
}

function mergeGeometry(
  stl: ReturnType<typeof parseStlGeometry>,
  summary: ReturnType<typeof geometryFromOpenScadSummary>
): ReturnType<typeof parseStlGeometry> {
  return {
    boundingBox: summary.boundingBox ?? stl.boundingBox,
    triangleCount: summary.triangleCount ?? stl.triangleCount
  };
}

function parseSummaryBoundingBox(
  value: unknown
): { min: [number, number, number]; max: [number, number, number] } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const min = toNumberTriplet((value as { min?: unknown }).min);
  const max = toNumberTriplet((value as { max?: unknown }).max);
  if (!min || !max) {
    return undefined;
  }

  return { min, max };
}

function toNumberTriplet(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    return undefined;
  }

  const numbers = value.map((item) => (typeof item === 'number' ? item : Number.NaN));
  if (!numbers.every(Number.isFinite)) {
    return undefined;
  }

  return [numbers[0], numbers[1], numbers[2]];
}

function parseAsciiStl(source: string): ReturnType<typeof parseStlGeometry> {
  const bounds = createBounds();
  const vertexPattern =
    /vertex\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

  for (const match of source.matchAll(vertexPattern)) {
    bounds.add([Number(match[1]), Number(match[2]), Number(match[3])]);
  }

  return {
    triangleCount: Array.from(source.matchAll(/\bfacet\s+normal\b/g)).length,
    boundingBox: bounds.value()
  };
}

function createBounds(): {
  add(point: number[]): void;
  value(): { min: [number, number, number]; max: [number, number, number] } | undefined;
} {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let seen = false;

  return {
    add(point: number[]) {
      seen = true;
      for (let index = 0; index < 3; index += 1) {
        min[index] = Math.min(min[index], point[index] ?? 0);
        max[index] = Math.max(max[index], point[index] ?? 0);
      }
    },
    value() {
      if (!seen) {
        return undefined;
      }
      return {
        min: [min[0], min[1], min[2]],
        max: [max[0], max[1], max[2]]
      };
    }
  };
}
