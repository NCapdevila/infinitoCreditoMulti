import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App.tsx';
import { alVolverAlInicio } from './lib/inicio.ts';

const root = document.getElementById('root');
if (root === null) throw new Error('falta #root en index.html');

/**
 * Cambiarle la `key` a la app la desmonta entera y la vuelve a montar: se van
 * el estado, los timers del polling y la cotización en curso, igual que al
 * recargar. Ver `lib/inicio.ts`.
 */
function Raiz() {
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => alVolverAlInicio(() => setVuelta((n) => n + 1)), []);
  return <App key={vuelta} />;
}

createRoot(root).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
);
