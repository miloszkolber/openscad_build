import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './components/App';
import {registerOpenSCADLanguage} from './language/openscad-register-language';
import {createInitialState} from './state/initial-state';
import './index.css';

window.addEventListener('load', async () => {
  // Retire service workers left by the original Playground on this origin.
  if ('serviceWorker' in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  }
  const root = document.getElementById('root')!;
  try {
    await registerOpenSCADLanguage();
    ReactDOM.createRoot(root).render(<App initialState={createInitialState()} />);
  } catch (error) {
    root.textContent = `Cannot start the browser: ${error}. Reload to retry.`;
  }
});
