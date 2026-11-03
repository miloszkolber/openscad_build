import { loadConfig, type AppConfig } from './config.js';
import { MockOpenScadRunner } from './openscad/MockOpenScadRunner.js';
import { OpenScadWasmRunner } from './openscad/OpenScadWasmRunner.js';
import type { OpenScadRunner } from './openscad/OpenScadRunner.js';
import { Semaphore } from './security/limits.js';
import type { ToolDependencies } from './tools/index.js';
import { WorkspaceManager } from './workspace/WorkspaceManager.js';

export async function createToolDependencies(
  config: AppConfig = loadConfig()
): Promise<ToolDependencies> {
  const workspace = new WorkspaceManager(config.paths);
  await workspace.init();

  const runner: OpenScadRunner =
    config.backend === 'mock'
      ? new MockOpenScadRunner()
      : new OpenScadWasmRunner(config.limits.maxRenderMs);

  return {
    config,
    runner,
    workspace,
    semaphore: new Semaphore(config.limits.maxParallelJobs)
  };
}
