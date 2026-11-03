import {useContext} from 'react';
import {ModelContext} from './contexts';

export default function Toolbar({refresh}: {refresh: () => void}) {
  const model = useContext(ModelContext)!;
  const state = model.state;
  const busy = state.previewing || state.rendering || state.exporting || state.checkingSyntax;
  return <header className="toolbar">
    <button onClick={refresh} title="Detect added and removed files">Refresh files</button>
    <span className="toolbar-status" role="status">{state.exporting ? 'Exporting…' : busy ? 'Rendering…' : ''}</span>
    {state.error && <p role="alert" title={state.error}>{state.error}</p>}
    <div className="toolbar-actions">
      <button className="primary" disabled={!state.output || !!state.error || !!busy} onClick={() => model.export()}>Download STL</button>
      <button disabled={!model.source || !!busy} onClick={() => model.render({isPreview: false, now: true})}>Render</button>
    </div>
  </header>;
}
