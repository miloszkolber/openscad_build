import {checkSyntax, render} from '../runner/actions';
import {State} from './app-state';
import {bubbleUpDeepMutations} from './deep-mutate';
import {downloadUrl} from '../utils';
import {ProcessStreams} from '../runner/openscad-runner';
import {parseOff} from '../io/import_off';
import {exportGlb} from '../io/export_glb';

export const PASTED_PATH = '/models/pasted.scad';

export class Model {
  private renderGeneration = 0;
  private syntaxGeneration = 0;
  private selection = 0;
  constructor(public state: State, private setStateCallback: (state: State) => void) {}

  mutate(change: (state: State) => void) {
    const next = bubbleUpDeepMutations(this.state, change);
    if (next === this.state) return false;
    this.state = next;
    this.setStateCallback(next);
    return true;
  }

  private clearOutput() {
    if (this.state.output) {
      URL.revokeObjectURL(this.state.output.outFileURL);
      URL.revokeObjectURL(this.state.output.displayFileURL);
    }
    this.mutate(s => s.output = undefined);
  }
  setVar(name: string, value: any) {
    if (this.state.exporting) return;
    // Keep the settled model visible while the next preview renders.
    this.mutate(s => s.params.vars = {...s.params.vars, [name]: value});
    this.render({isPreview: true, now: false});
  }

  async openMountedFile(path: string) {
    if (this.state.exporting) return;
    const selection = ++this.selection;
    const relative = path.slice('/models/'.length).split('/').map(encodeURIComponent).join('/');
    const response = await fetch('/models/' + relative, {cache: 'no-store'});
    if (!response.ok) throw new Error('Could not read ' + path);
    const content = await response.text();
    if (selection !== this.selection) return;
    this.mutate(s => { s.params.sources = [{path, content}]; });
    this.openFile(path);
  }

  openPastedCode(content = '') {
    if (this.state.exporting || (this.state.params.mode === 'paste' && content === '')) return;
    ++this.selection;
    this.mutate(s => {
      s.params = {activePath: PASTED_PATH, sources: [{path: PASTED_PATH, content}], mode: 'paste'};
      s.parameterSet = undefined;
      s.error = undefined;
    });
    this.processSource();
  }

  updatePastedSource(content: string) {
    if (this.state.params.mode !== 'paste' || this.state.exporting) return;
    this.mutate(s => {
      const source = s.params.sources.find(source => source.path === PASTED_PATH);
      if (source) source.content = content;
      s.params.vars = undefined;
      s.parameterSet = undefined;
      s.error = undefined;
    });
    if (!content.trim()) {
      ++this.renderGeneration;
      ++this.syntaxGeneration;
      this.clearOutput();
      this.mutate(s => { s.previewing = false; s.rendering = false; s.checkingSyntax = false; });
      return;
    }
    this.checkSyntax();
    this.render({isPreview: true, now: false});
  }

  private openFile(path: string) {
    ++this.selection;
    this.mutate(s => {
      s.params.activePath = path;
      s.params.mode = 'mounted';
      s.params.vars = undefined;
      s.parameterSet = undefined;
      s.error = undefined;
    });
    this.processSource();
  }

  get source() { return this.state.params.sources.find(source => source.path === this.state.params.activePath)?.content ?? ''; }

  private processSource() {
    ++this.renderGeneration;
    ++this.syntaxGeneration;
    this.clearOutput();
    this.mutate(s => { s.error = undefined; s.previewing = false; s.rendering = false; s.checkingSyntax = false; });
    if (!this.source.trim()) return;
    this.checkSyntax();
    this.render({isPreview: true, now: false});
  }

  private async checkSyntax() {
    const generation = ++this.syntaxGeneration;
    this.mutate(s => s.checkingSyntax = true);
    try {
      const result = await checkSyntax({activePath: this.state.params.activePath, sources: this.state.params.sources})({now: false});
      if (generation !== this.syntaxGeneration) return;
      this.mutate(s => { s.parameterSet = result.parameterSet; });
    } catch (error) {
      if (generation === this.syntaxGeneration) this.mutate(s => s.error = String(error));
    } finally {
      if (generation === this.syntaxGeneration) this.mutate(s => s.checkingSyntax = false);
    }
  }

  private rawStreams = (stream: ProcessStreams) => {
    this.mutate(s => s.currentRunLogs?.push('stdout' in stream ? ['stdout', stream.stdout] : ['stderr', stream.stderr]));
  };

  // Prefer the engine's own diagnostics over the transport-level failure.
  private failureMessage(error: unknown): string {
    const stderr = (this.state.currentRunLogs ?? [])
      .filter(([stream]) => stream === 'stderr')
      .map(([, text]) => text)
      .join('\n')
      .trim();
    return stderr || String(error);
  }

  async render({isPreview, now}: {isPreview: boolean, now: boolean}) {
    if (!this.source || this.state.exporting) return;
    const generation = ++this.renderGeneration;
    this.mutate(s => { s.currentRunLogs = []; s.previewing = isPreview; s.rendering = !isPreview; s.error = undefined; });
    try {
      const output = await render({scadPath: this.state.params.activePath, sources: this.state.params.sources,
        vars: this.state.params.vars, isPreview, mountArchives: true, renderFormat: 'off', streamsCallback: this.rawStreams})({now});
      if (generation !== this.renderGeneration) return;
      const display = await exportGlb(parseOff(await output.outFile.text()));
      if (generation !== this.renderGeneration) return;
      if (this.state.output) {
        URL.revokeObjectURL(this.state.output.outFileURL);
        URL.revokeObjectURL(this.state.output.displayFileURL);
      }
      this.mutate(s => {
        s.output = {isPreview, outFileURL: URL.createObjectURL(output.outFile), displayFileURL: URL.createObjectURL(display)};
      });
    } catch (error) {
      if (generation === this.renderGeneration) this.mutate(s => s.error = this.failureMessage(error));
    } finally {
      if (generation === this.renderGeneration) this.mutate(s => { s.previewing = false; s.rendering = false; });
    }
  }

  async export() {
    if (!this.state.output || this.state.error || this.state.previewing || this.state.rendering || this.state.exporting || this.state.checkingSyntax) return;
    this.mutate(s => s.exporting = true);
    try {
      const output = await render({scadPath: this.state.params.activePath, sources: this.state.params.sources,
        vars: this.state.params.vars, isPreview: false, mountArchives: true, renderFormat: 'stl', streamsCallback: this.rawStreams})({now: true});
      const url = URL.createObjectURL(output.outFile);
      downloadUrl(url, output.outFile.name);
      // Allow the browser to start the download before releasing its object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      this.mutate(s => s.error = this.failureMessage(error));
    } finally { this.mutate(s => s.exporting = false); }
  }
}
