import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initMatchSync, initKataSync } from './store/sync';
import { initAudioUnlock } from './lib/sound';
import './theme.css';

initMatchSync();
initKataSync();
initAudioUnlock();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
