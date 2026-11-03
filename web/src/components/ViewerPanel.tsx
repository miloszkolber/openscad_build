import {CSSProperties, useContext} from 'react';
import {ModelContext} from './contexts';

declare global {
  namespace JSX { interface IntrinsicElements { 'model-viewer': any; } }
}

export default function ViewerPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext)!;
  const source = model.state.output?.displayFileURL;
  return <div className={className} style={{position: 'relative', minWidth: 0, ...style}}>
    {source ? <model-viewer src={source} orientation="0deg -90deg 0deg"
      style={{width: '100%', height: '100%'}} camera-controls
      environment-image="./skybox-lights.jpg" camera-orbit="45deg 55deg auto"
      max-camera-orbit="auto 180deg auto" interaction-prompt="none" />
      : <p className="empty-state preview-empty">{model.state.error ? 'The model could not be rendered.' : 'Select a file to preview it.'}</p>}
  </div>;
}
