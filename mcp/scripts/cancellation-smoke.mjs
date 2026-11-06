// Run only in an otherwise idle, disposable WASM server container.
/* global process, console, performance, fetch, AbortController */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const serverPID = fs
  .readdirSync('/proc')
  .filter((p) => /^\d+$/.test(p))
  .find((p) => {
    try {
      return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8') === 'node\0mcp/dist/index.js\0';
    } catch {
      return false;
    }
  });
assert.ok(serverPID, 'server PID not found');
const base = `http://127.0.0.1:${process.env.PORT ?? 3333}`;
const limit = Number(process.env.MAX_RENDER_MS ?? 30000);
const workspace = process.env.WORKSPACE_DIR ?? '/workspace';
const smokeDir = path.join(workspace, 'smoke');
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream'
};
if (process.env.MCP_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.MCP_AUTH_TOKEN}`;
let id = 0;
const log = (event, data = {}) => console.log(JSON.stringify({ event, ...data }));
function sample() {
  const fields = fs.readFileSync(`/proc/${serverPID}/stat`, 'utf8').split(') ').at(-1).split(' ');
  return {
    ms: performance.now(),
    ticks: Number(fields[11]) + Number(fields[12]),
    threads: fs.readdirSync(`/proc/${serverPID}/task`).length
  };
}
async function waitUntil(check, message, timeout = 1500) {
  const start = performance.now();
  while (!check()) {
    assert.ok(performance.now() - start < timeout, message);
    await delay(25);
  }
}
async function rpc(method, params, signal) {
  const requestID = ++id;
  const response = await fetch(base + '/mcp', {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ jsonrpc: '2.0', id: requestID, method, params })
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = response.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split(/\r?\n\r?\n/)
        .flatMap((block) => {
          const data = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          return data ? [JSON.parse(data)] : [];
        })
        .find((message) => message.id === requestID)
    : JSON.parse(text);
  assert.equal(body?.id, requestID);
  assert.equal(body.error, undefined, JSON.stringify(body));
  return body.result;
}
async function tool(name, args, signal) {
  const result = await rpc('tools/call', { name, arguments: args }, signal);
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent ?? JSON.parse(result.content.find((c) => c.type === 'text').text);
}
const scad =
  'difference(){union(){for(i=[0:160]) rotate([0,0,i*2.2]) translate([20,0,0]) sphere(r=6,$fn=64);} sphere(r=25,$fn=96);}';
const heavy = (signal, timeoutMs) =>
  tool(
    'openscad_export_model',
    {
      scad,
      format: 'stl',
      outputPath: 'smoke/heavy.stl',
      enableManifold: false,
      timeoutMs
    },
    signal
  );
const pendingHeavy = (controller) =>
  heavy(controller.signal).then(
    (value) => ({ value }),
    (error) => ({ error: error.name })
  );
fs.rmSync(smokeDir, { recursive: true, force: true });
await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'cancellation-smoke', version: '1' }
});
assert.equal((await rpc('tools/list', {})).tools.length, 8);
const cube = await tool('openscad_export_model', {
  scad: 'cube([2,3,4]);',
  format: 'stl',
  outputPath: 'smoke/cube.stl'
});
assert.equal(cube.ok, true, JSON.stringify(cube));
const bytes = fs.readFileSync(path.join(workspace, cube.output.path));
assert.equal(bytes.length, cube.output.sizeBytes);
assert.equal(createHash('sha256').update(bytes).digest('hex'), cube.output.sha256);
const geometry = await tool('openscad_analyze_model', { scad: 'cube([2,3,4]);' });
assert.equal(geometry.ok, true, JSON.stringify(geometry));
assert.deepEqual(geometry.summary.boundingBox, { min: [0, 0, 0], max: [2, 3, 4] });
assert.equal(geometry.summary.triangleCount, 12);
const screenshot = await tool('openscad_screenshot', {
  scad: 'cube([2,3,4]);',
  width: 64,
  height: 64
});
assert.equal(screenshot.ok, true, JSON.stringify(screenshot));
assert.equal(screenshot.image.format, 'png');
log('export_analysis_screenshot_pass', {
  sizeBytes: bytes.length,
  boundingBox: geometry.summary.boundingBox,
  triangles: geometry.summary.triangleCount,
  screenshotBytes: screenshot.image.sizeBytes
});
// Warm WASM and sharp first: native libraries may create persistent helper threads.
const baseline = sample();

const timedStart = performance.now();
const timed = await heavy(undefined, limit * 2);
assert.equal(timed.ok, false);
assert.ok(timed.stderr.includes(`timed out after ${limit} ms`), JSON.stringify(timed));
assert.ok(performance.now() - timedStart < limit * 2);
log('timeout_ceiling_pass', { elapsedMs: Math.round(performance.now() - timedStart), limit });
await waitUntil(() => sample().threads === baseline.threads, 'timeout did not release worker');

const active = new AbortController();
const activeStart = sample();
const pending = pendingHeavy(active);
await waitUntil(() => sample().threads > baseline.threads, 'render did not start');
await delay(500);
assert.ok(sample().ticks - activeStart.ticks > 10, 'render was not CPU-active');
const abortAt = performance.now();
active.abort();
assert.deepEqual(await pending, { error: 'AbortError' });
await waitUntil(() => sample().threads === baseline.threads, 'abort did not terminate worker');
log('active_cancel_pass', { cleanupMs: Math.round(performance.now() - abortAt) });
const idle = sample();
await delay(2000);
const idleTicks = sample().ticks - idle.ticks;
assert.ok(idleTicks <= 5, `CPU remained active: ${idleTicks} ticks`);
log('post_abort_idle_pass', { cpuTicks: idleTicks, elapsedMs: 2000 });

const firstController = new AbortController();
const first = pendingHeavy(firstController);
await waitUntil(() => sample().threads > baseline.threads, 'queue blocker did not start');
const queuedController = new AbortController();
const queued = pendingHeavy(queuedController);
await delay(100);
queuedController.abort();
assert.deepEqual(await queued, { error: 'AbortError' });
assert.equal(sample().threads, baseline.threads + 1, 'queued request started a second worker');
firstController.abort();
assert.deepEqual(await first, { error: 'AbortError' });
await waitUntil(() => sample().threads === baseline.threads, 'queue cleanup did not finish');
const after = await tool('openscad_export_model', {
  scad: 'cube(1);',
  format: 'stl',
  outputPath: 'smoke/after.stl'
});
assert.equal(after.ok, true, JSON.stringify(after));
log('queued_cancel_and_permit_reuse_pass', { threads: sample().threads });
fs.rmSync(smokeDir, { recursive: true, force: true });
log('pass');
