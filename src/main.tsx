import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { initMatchSync, initKataSync } from './store/sync';
import { initAudioUnlock } from './lib/sound';
import './theme.css';

initMatchSync();
initKataSync();
initAudioUnlock();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* HashRouter, not BrowserRouter: on GitHub Pages there is no server to
        rewrite deep links, and the routes live under a project sub-path. A hash
        keeps every route (and the pop-out display windows) working with no
        server config and no 404 fallback. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
