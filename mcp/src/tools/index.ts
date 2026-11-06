import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config.js';
import type { OpenScadRunner } from '../openscad/OpenScadRunner.js';
import type { Semaphore } from '../security/limits.js';
import type { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { handleAnalyzeModel, analyzeModelInputSchema } from './analyzeModel.js';
import { handleExportModel, exportModelInputSchema } from './exportModel.js';
import { handleScreenshot, screenshotInputSchema } from './screenshot.js';
import { asMcpImageResult, asMcpToolResult } from './toolResponse.js';
import { handleValidate, validateInputSchema } from './validate.js';
import {
  handleWorkspaceDeleteFile,
  handleWorkspaceListFiles,
  handleWorkspaceReadFile,
  handleWorkspaceWriteFile,
  workspaceDeleteFileInputSchema,
  workspaceListFilesInputSchema,
  workspaceReadFileInputSchema,
  workspaceWriteFileInputSchema
} from './workspace.js';

export interface ToolDependencies {
  signal?: AbortSignal;
  config: AppConfig;
  runner: OpenScadRunner;
  workspace: WorkspaceManager;
  semaphore: Semaphore;
}

export function registerTools(server: McpServer, deps: ToolDependencies): void {
  const requestDependencies = (signal: AbortSignal): ToolDependencies => ({
    ...deps,
    signal: deps.signal ? AbortSignal.any([deps.signal, signal]) : signal
  });
  server.registerTool(
    'openscad_validate',
    {
      title: 'Validate OpenSCAD',
      description: 'Validate a workspace SCAD file or inline source and return diagnostics.',
      inputSchema: validateInputSchema.shape
    },
    async (input, extra) =>
      asMcpToolResult(await handleValidate(input, requestDependencies(extra.signal)))
  );

  server.registerTool(
    'openscad_export_model',
    {
      title: 'Export OpenSCAD Model',
      description:
        'Export a workspace SCAD file or inline source to an allowed model/vector format and write it to the workspace.',
      inputSchema: exportModelInputSchema.shape
    },
    async (input, extra) =>
      asMcpToolResult(await handleExportModel(input, requestDependencies(extra.signal)))
  );

  server.registerTool(
    'openscad_screenshot',
    {
      title: 'Screenshot OpenSCAD Model',
      description:
        'Render a shaded PNG or WebP image of a workspace SCAD file or inline source and return it inline.',
      inputSchema: screenshotInputSchema.shape
    },
    async (input, extra) =>
      asMcpImageResult(await handleScreenshot(input, requestDependencies(extra.signal)))
  );

  server.registerTool(
    'openscad_analyze_model',
    {
      title: 'Analyze OpenSCAD Model',
      description:
        'Compute a bounding box and triangle count for a workspace SCAD file or inline source.',
      inputSchema: analyzeModelInputSchema.shape
    },
    async (input, extra) =>
      asMcpToolResult(await handleAnalyzeModel(input, requestDependencies(extra.signal)))
  );

  server.registerTool(
    'workspace_list_files',
    {
      title: 'List Workspace Files',
      description: 'List files inside the configured model workspace.',
      inputSchema: workspaceListFilesInputSchema.shape
    },
    async (input) => asMcpToolResult(await handleWorkspaceListFiles(input, deps))
  );

  server.registerTool(
    'workspace_read_file',
    {
      title: 'Read Workspace File',
      description: 'Read an allowed file from the model workspace.',
      inputSchema: workspaceReadFileInputSchema.shape
    },
    async (input) => asMcpToolResult(await handleWorkspaceReadFile(input, deps))
  );

  server.registerTool(
    'workspace_write_file',
    {
      title: 'Write Workspace File',
      description: 'Write an allowed text file under the model workspace.',
      inputSchema: workspaceWriteFileInputSchema.shape
    },
    async (input) => asMcpToolResult(await handleWorkspaceWriteFile(input, deps))
  );

  server.registerTool(
    'workspace_delete_file',
    {
      title: 'Delete Workspace File',
      description: 'Delete an allowed file under the model workspace.',
      inputSchema: workspaceDeleteFileInputSchema.shape
    },
    async (input) => asMcpToolResult(await handleWorkspaceDeleteFile(input, deps))
  );
}
