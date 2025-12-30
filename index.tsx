
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Registra o Service Worker para suporte a PWA e Notificações
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registrado!', reg))
      .catch(err => console.log('Erro ao registrar SW:', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
