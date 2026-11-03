import {CSSProperties, useContext} from 'react';
import Editor from '@monaco-editor/react';
import {ModelContext} from './contexts';
import openscadEditorOptions from '../language/openscad-editor-options';

export default function EditorPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext)!;
  const pasted = model.state.params.mode === 'paste';
  return <section className={`editor-panel ${className ?? ''}`} style={{display: 'flex', flexDirection: 'column', minWidth: 0, ...style}}>
    {!model.state.params.activePath ? <p className="empty-state source-empty">Select a SCAD file or paste code.</p> :
    <div style={{position: 'relative', flex: 1}}>
      <Editor className="openscad-editor absolute-fill" defaultLanguage="openscad"
        value={model.source}
        onChange={pasted ? value => model.updatePastedSource(value ?? '') : undefined}
        options={{...openscadEditorOptions, readOnly: !pasted || !!model.state.exporting, domReadOnly: !pasted || !!model.state.exporting, fontSize: 13, lineHeight: 20, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineNumbers: 'on', minimap: {enabled: false}, padding: {top: 12}, automaticLayout: true}} />
    </div>}
  </section>;
}
