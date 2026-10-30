import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutoSync } from './lib/sync/engine';
import './styles.css';

// Asks the browser not to clear local data under storage pressure.
void navigator.storage?.persist?.();
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
