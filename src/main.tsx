import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { VocabProvider } from './lib/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VocabProvider>
      <App />
    </VocabProvider>
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
