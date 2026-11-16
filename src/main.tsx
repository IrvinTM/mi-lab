import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutoBackup } from './state/autoBackup';
import { startFlushOnClose } from './state/flushOnClose';
import { useInventoryStore } from './state/store';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startAutoBackup(useInventoryStore);
startFlushOnClose(useInventoryStore);
