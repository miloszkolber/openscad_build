import sharp from 'sharp';
import { formatCamera } from './camera.js';

const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const MAX_IMAGE_TRIANGLES = 500_000;
const SVG_PADDING = 0.86;

export type ImageFormat = 'png' | 'webp';

type Vec3 = [number, number, number];
type Vec2 = [number, number];

interface Triangle {
  vertices: [Vec3, Vec3, Vec3];
  normal: Vec3;
}

interface Camera {
  eye: Vec3;
  target: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

interface ProjectedTriangle {
  points: [Vec2, Vec2, Vec2];
  depth: number;
  color: string;
}

export interface StlImageOptions {
  width?: number;
  height?: number;
  camera?: string;
  viewAll?: boolean;
  autoCenter?: boolean;
  projection?: 'orthogonal' | 'perspective';
  format?: ImageFormat;
}

export async function renderStlImage(
  stl: Buffer,
  options: StlImageOptions
): Promise<{ data: Buffer; format: ImageFormat; width: number; height: number }> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const format = options.format ?? 'png';
  const triangles = parseStlTriangles(stl);

  if (triangles.length > MAX_IMAGE_TRIANGLES) {
    throw new Error(
      `Image STL has ${triangles.length} triangles, above the ${MAX_IMAGE_TRIANGLES} triangle limit.`
    );
  }

  const svg = renderStlImageSvg(triangles, {
    ...options,
    width,
    height
  });

  const image = sharp(Buffer.from(svg), { limitInputPixels: width * height });
  const data =
    format === 'webp'
      ? await image.webp({ quality: 86, effort: 4 }).toBuffer()
      : await image.png({ compressionLevel: 9 }).toBuffer();

  return { data, format, width, height };
}

export function parseStlTriangles(data: Buffer): Triangle[] {
  return parseBinaryStl(data) ?? parseAsciiStl(data.toString('utf8'));
}

function renderStlImageSvg(
  triangles: Triangle[],
  options: Required<Pick<StlImageOptions, 'width' | 'height'>> & StlImageOptions
): string {
  const bounds = boundsForTriangles(triangles);
  if (!bounds) {
    return blankSvg(options.width, options.height);
  }

  const camera = createCamera(bounds, options);
  const projection = options.projection ?? 'orthogonal';
  const projected = projectTriangles(triangles, camera, projection);
  if (projected.length === 0) {
    return blankSvg(options.width, options.height);
  }

  const view = boundsForProjected(projected);
  if (!view) {
    return blankSvg(options.width, options.height);
  }

  const viewAllScale = options.viewAll === false ? 0.72 : SVG_PADDING;
  const scale =
    viewAllScale *
    Math.min(
      options.width / Math.max(view.max[0] - view.min[0], 1),
      options.height / Math.max(view.max[1] - view.min[1], 1)
    );
  const center: Vec2 = [(view.min[0] + view.max[0]) / 2, (view.min[1] + view.max[1]) / 2];

  const outline =
    triangles.length <= 2000
      ? 'stroke="#344054" stroke-opacity="0.28" stroke-width="0.75"'
      : 'stroke-width="0.6"';
  const polygons = projected
    .sort((left, right) => right.depth - left.depth)
    .map((triangle) => {
      const points = triangle.points
        .map((point) => [
          options.width / 2 + (point[0] - center[0]) * scale,
          options.height / 2 - (point[1] - center[1]) * scale
        ])
        .map(([x, y]) => `${formatSvgNumber(x)},${formatSvgNumber(y)}`)
        .join(' ');
      const stroke = outline.startsWith('stroke-width')
        ? `stroke="${triangle.color}" ${outline}`
        : outline;
      return `<polygon points="${points}" fill="${triangle.color}" ${stroke}/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" shape-rendering="geometricPrecision"><rect width="100%" height="100%" fill="#f8fafc"/>${polygons}</svg>`;
}

function parseBinaryStl(data: Buffer): Triangle[] | undefined {
  if (data.byteLength < 84) {
    return undefined;
  }

  const triangleCount = data.readUInt32LE(80);
  if (84 + triangleCount * 50 !== data.byteLength) {
    return undefined;
  }

  const triangles: Triangle[] = [];
  let offset = 84;
  for (let index = 0; index < triangleCount; index += 1) {
    offset += 12;
    const vertices: [Vec3, Vec3, Vec3] = [
      readVec3(data, offset),
      readVec3(data, offset + 12),
      readVec3(data, offset + 24)
    ];
    triangles.push({ vertices, normal: triangleNormal(vertices) });
    offset += 38;
  }

  return triangles;
}

function parseAsciiStl(source: string): Triangle[] {
  const number = '[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?';
  const vertexPattern = new RegExp(`vertex\\s+(${number})\\s+(${number})\\s+(${number})`, 'g');
  const vertices: Vec3[] = [];
  for (const match of source.matchAll(vertexPattern)) {
    vertices.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }

  const triangles: Triangle[] = [];
  for (let index = 0; index + 2 < vertices.length; index += 3) {
    const triangleVertices: [Vec3, Vec3, Vec3] = [
      vertices[index],
      vertices[index + 1],
      vertices[index + 2]
    ];
    triangles.push({ vertices: triangleVertices, normal: triangleNormal(triangleVertices) });
  }

  return triangles;
}

function readVec3(data: Buffer, offset: number): Vec3 {
  return [data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8)];
}

function createCamera(bounds: { min: Vec3; max: Vec3 }, options: StlImageOptions): Camera {
  const center = midpoint(bounds.min, bounds.max);
  const diagonal = Math.max(length(sub(bounds.max, bounds.min)), 1);

  let eye: Vec3;
  let target: Vec3;

  if (options.camera) {
    const cameraValues = formatCamera(options.camera)
      .split(',')
      .map((value) => Number(value));
    if (cameraValues.length === 6) {
      eye = [cameraValues[0], cameraValues[1], cameraValues[2]];
      target = options.autoCenter ? center : [cameraValues[3], cameraValues[4], cameraValues[5]];
    } else {
      target = options.autoCenter ? center : [cameraValues[0], cameraValues[1], cameraValues[2]];
      const distance = Math.max(Math.abs(cameraValues[6]), diagonal * 1.8, 1);
      const offset = rotateEuler(
        [0, 0, distance],
        cameraValues[3],
        cameraValues[4],
        cameraValues[5]
      );
      eye = add(target, offset);
    }
  } else {
    target = center;
    eye = add(center, scale(normalize([1.45, -1.65, 1.1]), diagonal * 1.8));
  }

  if (length(sub(target, eye)) < 1e-9) {
    eye = add(target, scale(normalize([1, -1, 0.7]), diagonal * 1.8));
  }

  const forward = normalize(sub(target, eye));
  const worldUp: Vec3 = Math.abs(dot(forward, [0, 0, 1])) > 0.96 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));

  return { eye, target, forward, right, up };
}

function projectTriangles(
  triangles: Triangle[],
  camera: Camera,
  projection: 'orthogonal' | 'perspective'
): ProjectedTriangle[] {
  const light = normalize(
    add(add(scale(camera.right, -0.45), scale(camera.up, 0.65)), scale(camera.forward, -0.6))
  );
  const focalLength = Math.max(length(sub(camera.target, camera.eye)), 1);
  const projected: ProjectedTriangle[] = [];

  for (const triangle of triangles) {
    const points = triangle.vertices.map((vertex) =>
      projectPoint(vertex, camera, projection, focalLength)
    );
    if (points.some((point) => !point)) {
      continue;
    }

    const validPoints = points as [
      { point: Vec2; depth: number },
      { point: Vec2; depth: number },
      { point: Vec2; depth: number }
    ];
    projected.push({
      points: [validPoints[0].point, validPoints[1].point, validPoints[2].point],
      depth: (validPoints[0].depth + validPoints[1].depth + validPoints[2].depth) / 3,
      color: shadeTriangle(triangle.normal, camera, light)
    });
  }

  return projected;
}

function projectPoint(
  vertex: Vec3,
  camera: Camera,
  projection: 'orthogonal' | 'perspective',
  focalLength: number
): { point: Vec2; depth: number } | undefined {
  const relative = sub(vertex, camera.eye);
  const depth = dot(relative, camera.forward);
  if (projection === 'perspective' && depth <= 1e-6) {
    return undefined;
  }

  const x = dot(relative, camera.right);
  const y = dot(relative, camera.up);
  if (projection === 'perspective') {
    const factor = focalLength / Math.max(depth, 1e-6);
    return { point: [x * factor, y * factor], depth };
  }

  return { point: [x, y], depth };
}

function shadeTriangle(normal: Vec3, camera: Camera, light: Vec3): string {
  let oriented = normalize(normal);
  if (length(oriented) === 0) {
    oriented = camera.forward;
  }
  if (dot(oriented, camera.forward) > 0) {
    oriented = scale(oriented, -1);
  }

  const diffuse = Math.max(0, dot(oriented, light));
  const facing = Math.abs(dot(oriented, camera.forward));
  const intensity = 0.48 + diffuse * 0.34 + facing * 0.16;
  const base = [72, 128, 166];
  const highlight = [228, 196, 124];
  const mix = Math.max(0, Math.min(1, intensity));
  const rgb = base.map((channel, index) =>
    Math.round(channel * (1 - mix) + (highlight[index] ?? channel) * mix)
  );

  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function triangleNormal(vertices: [Vec3, Vec3, Vec3]): Vec3 {
  return normalize(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])));
}

function boundsForTriangles(triangles: Triangle[]): { min: Vec3; max: Vec3 } | undefined {
  if (triangles.length === 0) {
    return undefined;
  }

  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const triangle of triangles) {
    for (const vertex of triangle.vertices) {
      for (let index = 0; index < 3; index += 1) {
        min[index] = Math.min(min[index], vertex[index]);
        max[index] = Math.max(max[index], vertex[index]);
      }
    }
  }

  return { min, max };
}

function boundsForProjected(triangles: ProjectedTriangle[]): { min: Vec2; max: Vec2 } | undefined {
  if (triangles.length === 0) {
    return undefined;
  }

  const min: Vec2 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec2 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const triangle of triangles) {
    for (const point of triangle.points) {
      min[0] = Math.min(min[0], point[0]);
      min[1] = Math.min(min[1], point[1]);
      max[0] = Math.max(max[0], point[0]);
      max[1] = Math.max(max[1], point[1]);
    }
  }

  return { min, max };
}

function blankSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/></svg>`;
}

function rotateEuler(vector: Vec3, rxDegrees: number, ryDegrees: number, rzDegrees: number): Vec3 {
  const rx = degreesToRadians(rxDegrees);
  const ry = degreesToRadians(ryDegrees);
  const rz = degreesToRadians(rzDegrees);
  const afterX: Vec3 = [
    vector[0],
    vector[1] * Math.cos(rx) - vector[2] * Math.sin(rx),
    vector[1] * Math.sin(rx) + vector[2] * Math.cos(rx)
  ];
  const afterY: Vec3 = [
    afterX[0] * Math.cos(ry) + afterX[2] * Math.sin(ry),
    afterX[1],
    -afterX[0] * Math.sin(ry) + afterX[2] * Math.cos(ry)
  ];
  return [
    afterY[0] * Math.cos(rz) - afterY[1] * Math.sin(rz),
    afterY[0] * Math.sin(rz) + afterY[1] * Math.cos(rz),
    afterY[2]
  ];
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function midpoint(left: Vec3, right: Vec3): Vec3 {
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function sub(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vec3): Vec3 {
  const vectorLength = length(vector);
  if (vectorLength === 0) {
    return [0, 0, 0];
  }
  return scale(vector, 1 / vectorLength);
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
