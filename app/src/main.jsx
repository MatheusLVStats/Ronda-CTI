import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Pequenos complementos para navegadores antigos dos computadores do hospital.
if (!Array.prototype.at) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'at', { value(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return this[n]; }, configurable: true, writable: true });
}
if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
if (!globalThis.structuredClone) globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));

createRoot(document.getElementById('root')).render(<App />);

// Funciona offline e avisa quando há versão nova.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'activated' && navigator.serviceWorker.controller) window.dispatchEvent(new Event('ronda-update'));
        });
      });
    }).catch(() => {});
  });
}
