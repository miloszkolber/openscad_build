import {ReactNode, useContext, useEffect, useState} from 'react';
import {ModelContext} from './contexts';
type FileIndex = {[name: string]: FileIndex | null};

export default function FilePicker({refreshKey}: {refreshKey: number}) {
  const model = useContext(ModelContext)!;
  const [files, setFiles] = useState<FileIndex>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/files', {cache: 'no-store', signal: controller.signal})
      .then(response => { if (!response.ok) throw new Error('Cannot list mounted files'); return response.json(); })
      .then(index => { setFiles(index); setError(''); })
      .catch(error => { if (!controller.signal.aborted) setError(String(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey]);
  function entries(index: FileIndex, parent = '/models'): ReactNode[] {
    return Object.entries(index).flatMap(([name, value]) => {
      const path = `${parent}/${name}`;
      if (value !== null) {
        const children = entries(value, path);
        return children.length ? [<details key={path} open><summary>{name}</summary><div className="file-children">{children}</div></details>] : [];
      }
      if (!name.toLowerCase().endsWith('.scad')) return [];
      return [<button key={path} className="file-entry" title={path.slice(8)} aria-current={model.state.params.activePath === path ? 'true' : undefined}
        onClick={() => model.openMountedFile(path).catch(error => setError(String(error)))}>{name}</button>];
    });
  }
  const tree = entries(files);
  return <aside className="files-sidebar" aria-label="Mounted SCAD files">
    {error && <p role="alert">{error}</p>}
    <button className="file-entry paste-entry" aria-current={model.state.params.mode === 'paste' ? 'true' : undefined}
      title="Paste OpenSCAD code without writing a file" onClick={() => model.openPastedCode()}>Paste code</button>
    <nav aria-label="SCAD files" aria-busy={loading}>{tree}</nav>
    {!loading && !tree.length && <p className="empty-state">No SCAD files found.</p>}
    {model.state.params.mode === 'paste' && <p className="empty-state">Pasted code renders from memory. It is never written to the model directory.</p>}
  </aside>;
}
