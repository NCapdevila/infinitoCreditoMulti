import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (root === null) throw new Error('falta #root en index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
