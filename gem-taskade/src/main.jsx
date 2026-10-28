import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installStorage } from './lib/storage.js';
import { initAuth, currentUserId } from './lib/auth.js';

installStorage();

// Bootstrap auth before mount so App can read a stable user id on first render.
await initAuth(window.__gem?.supabase);
window.__gem = { ...(window.__gem || {}), userId: currentUserId() };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
