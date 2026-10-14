// Publica el simulador protegido con clave: cifra dist-single/index.html (build autocontenido) y genera
// dist-web/index.html, una página que pide la clave y descifra la aplicación en el navegador.
//   build → gzip → AES-256-GCM (clave aleatoria por build) → la clave AES se cifra con la clave pública
//   RSA-OAEP de scripts/acceso.json. En el navegador: clave de acceso → PBKDF2 → descifra la clave privada
//   RSA → descifra la clave AES → descifra y descomprime la aplicación → document.write.
// Uso: node scripts/proteger.mjs [entrada=dist-single/index.html] [salida=dist-web]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';

const [entrada = 'dist-single/index.html', salida = 'dist-web'] = process.argv.slice(2);
const acceso = JSON.parse(readFileSync(new URL('./acceso.json', import.meta.url), 'utf8'));
const html = readFileSync(entrada);
const b64 = (b) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('base64');

const publica = await crypto.subtle.importKey('spki', Buffer.from(acceso.publica.spki, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
const claveAES = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, claveAES, gzipSync(html, { level: 9 }));
const claveCifrada = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publica, await crypto.subtle.exportKey('raw', claveAES));

const paquete = { v: 1, kdf: acceso.kdf, privada: acceso.privada, clave: b64(claveCifrada), iv: b64(iv), datos: b64(datos) };

const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<link rel="icon" href="data:," />
<title>AWTP EAST</title>
<style>
  :root { --bg: #eef1f4; --card: #fff; --txt: #1b2430; --dim: #5b6776; --line: #c9d1da; --accent: #0b6bcb; --crit: #c62828; }
  @media (prefers-color-scheme: dark) { :root { --bg: #11161c; --card: #1a2129; --txt: #e3e8ee; --dim: #94a1b0; --line: #2e3945; --accent: #4ea1f3; --crit: #ef6461; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--txt); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display: grid; place-items: center; padding: 16px; }
  form { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 24px; width: 100%; max-width: 360px; display: grid; gap: 12px; }
  h1 { font-size: 1.15rem; margin: 0; }
  p { margin: 0; color: var(--dim); font-size: 0.88rem; }
  label { font-size: 0.85rem; color: var(--dim); display: grid; gap: 4px; }
  input[type=password] { font: inherit; padding: 9px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--txt); width: 100%; }
  .recordar { display: flex; align-items: center; gap: 8px; }
  button { font: inherit; font-weight: 600; padding: 9px 12px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: progress; }
  .error { color: var(--crit); min-height: 1.2em; font-size: 0.85rem; }
</style>
</head>
<body>
<form id="f" autocomplete="on">
  <h1 id="t1">Simulador AWTP EAST</h1>
  <p id="t2">Contenido restringido. Ingresá la clave de acceso.</p>
  <input type="text" name="username" autocomplete="username" value="awtp-east" hidden />
  <label><span id="t3">Clave</span><input type="password" id="clave" autocomplete="current-password" required autofocus /></label>
  <label class="recordar"><input type="checkbox" id="recordar" /> <span id="t4">Recordar en este equipo</span></label>
  <button id="entrar" type="submit">Entrar</button>
  <div class="error" id="error" role="alert"></div>
</form>
<script id="paquete" type="application/json">${JSON.stringify(paquete)}</script>
<script>
(() => {
  const en = /^\\/en(\\/|$)/.test(location.pathname);
  const T = en
    ? { t1: 'AWTP EAST Simulator', t2: 'Restricted content. Enter the access password.', t3: 'Password', t4: 'Remember on this device', entrar: 'Enter', abriendo: 'Opening…', mal: 'Wrong password.', nav: 'This browser does not support the required encryption (use a recent browser over HTTPS).' }
    : { t1: 'Simulador AWTP EAST', t2: 'Contenido restringido. Ingresá la clave de acceso.', t3: 'Clave', t4: 'Recordar en este equipo', entrar: 'Entrar', abriendo: 'Abriendo…', mal: 'Clave incorrecta.', nav: 'Este navegador no soporta el cifrado necesario (usar un navegador actual con HTTPS).' };
  document.documentElement.lang = en ? 'en' : 'es';
  for (const id of ['t1', 't2', 't3', 't4', 'entrar']) document.getElementById(id).textContent = T[id];
  document.title = T.t1;
  const P = JSON.parse(document.getElementById('paquete').textContent);
  const S = crypto.subtle;
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const CLAVE_GUARDADA = 'awtp.acceso.' + P.kdf.sal;
  const leer = (st) => { try { return st.getItem(CLAVE_GUARDADA); } catch { return null; } };
  const guardar = (st, v) => { try { st.setItem(CLAVE_GUARDADA, v); } catch {} };
  const borrar = () => { for (const st of [localStorage, sessionStorage]) { try { st.removeItem(CLAVE_GUARDADA); } catch {} } };

  async function derivar(clave) {
    const base = await S.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await S.deriveBits({ name: 'PBKDF2', hash: P.kdf.hash, salt: bytes(P.kdf.sal), iterations: P.kdf.iteraciones }, base, 256));
  }
  async function abrir(kekBits) {
    const kek = await S.importKey('raw', kekBits, 'AES-GCM', false, ['decrypt']);
    const pkcs8 = await S.decrypt({ name: 'AES-GCM', iv: bytes(P.privada.iv) }, kek, bytes(P.privada.datos));
    const privada = await S.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    const raw = await S.decrypt({ name: 'RSA-OAEP' }, privada, bytes(P.clave));
    const aes = await S.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const gz = await S.decrypt({ name: 'AES-GCM', iv: bytes(P.iv) }, aes, bytes(P.datos));
    const html = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    document.open();
    document.write(html);
    document.close();
  }
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const f = document.getElementById('f');
  const btn = document.getElementById('entrar');
  const err = document.getElementById('error');
  if (!S || typeof DecompressionStream === 'undefined') { err.textContent = T.nav; btn.disabled = true; return; }

  const guardada = leer(sessionStorage) || leer(localStorage);
  if (guardada) abrir(bytes(guardada)).catch(borrar);

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = T.abriendo;
    const recordar = document.getElementById('recordar').checked;
    try {
      const bits = await derivar(document.getElementById('clave').value);
      await abrir(bits);
      // solo se guarda si la clave abrió la aplicación
      guardar(sessionStorage, b64(bits));
      if (recordar) guardar(localStorage, b64(bits));
    } catch (e) {
      btn.disabled = false;
      btn.textContent = T.entrar;
      err.textContent = T.mal;
    }
  });
})();
</script>
</body>
</html>
`;

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });
writeFileSync(`${salida}/index.html`, pagina);
console.log(`${salida}/index.html: ${(Buffer.byteLength(pagina) / 1024).toFixed(0)} kB (aplicación ${(html.length / 1024).toFixed(0)} kB cifrada)`);
