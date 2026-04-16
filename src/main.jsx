import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import { initSentry } from '@/lib/sentry.js';
import '@/lib/i18n.js';
import '@/index.css';
import '@/styles/landing.css';

initSentry();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
