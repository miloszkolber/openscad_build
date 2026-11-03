import {useEffect, useState} from 'react';
import {State} from '../state/app-state';
import {Model} from '../state/model';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanel';
import Toolbar from './Toolbar';
import {ModelContext} from './contexts';
import CustomizerPanel from './CustomizerPanel';
import FilePicker from './FilePicker';

export function App({initialState}: {initialState: State}) {
  const [state, setState] = useState(initialState);
  const [model] = useState(() => new Model(initialState, setState));
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['F5', 'F6', 'F7'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'F7') model.export();
      else model.render({isPreview: event.key === 'F5', now: true});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model]);
  return <ModelContext.Provider value={model}><div className="workspace">
    <Toolbar refresh={() => setRefresh(value => value + 1)} />
    <main className="workspace-columns">
      <FilePicker refreshKey={refresh} /><EditorPanel />
      <section className="model-panel" aria-label="Model and logs">
        <ViewerPanel className="preview-panel" />
        <details className="logs-panel"><summary>Logs</summary>
          <pre aria-label="Render logs">{(state.currentRunLogs ?? []).map(([, text]) => text).join('\n') || 'No render output yet.'}</pre>
        </details>
      </section>
      <aside className="properties-sidebar" aria-label="Properties"><CustomizerPanel /></aside>
    </main>
  </div></ModelContext.Provider>;
}
