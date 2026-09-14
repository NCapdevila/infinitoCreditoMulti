/**
 * Levanta el BFF y el front juntos.
 *
 *   npm run dev
 *
 * Hacen falta los dos: el front pide `/api` y Vite lo proxea al BFF. Arrancar
 * uno solo deja la app sin pasos que mostrar, así que se lanzan de a pares y si
 * uno se cae, se corta el otro.
 */
import { spawn } from 'node:child_process';

const procesos = [
  { nombre: 'bff', color: '\x1b[36m', args: ['run', 'dev', '-w', '@infinito/bff'] },
  { nombre: 'web', color: '\x1b[35m', args: ['run', 'dev', '-w', '@infinito/web'] },
];

const RESET = '\x1b[0m';
const lanzados = [];
let cerrando = false;

const cerrarTodo = (codigo) => {
  if (cerrando) return;
  cerrando = true;
  for (const p of lanzados) p.kill();
  process.exit(codigo);
};

for (const { nombre, color, args } of procesos) {
  // En Windows npm es un .cmd: sin shell, spawn no lo encuentra.
  const hijo = spawn('npm', args, { shell: true });
  lanzados.push(hijo);

  const prefijo = `${color}[${nombre}]${RESET} `;
  const escribir = (destino) => (dato) => {
    for (const linea of dato.toString().split('\n')) {
      if (linea.trim() !== '') destino.write(prefijo + linea + '\n');
    }
  };

  hijo.stdout.on('data', escribir(process.stdout));
  hijo.stderr.on('data', escribir(process.stderr));
  hijo.on('exit', (codigo) => {
    if (!cerrando) console.log(`${prefijo}terminó con código ${codigo ?? 0}`);
    cerrarTodo(codigo ?? 0);
  });
}

process.on('SIGINT', () => cerrarTodo(0));
process.on('SIGTERM', () => cerrarTodo(0));

console.log('BFF  → http://localhost:5181');
console.log('app  → http://localhost:5180');
