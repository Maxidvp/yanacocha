// Genera scripts/acceso.json: par de claves RSA-OAEP para publicar el sitio cifrado.
// - La clave pública cifra cada build en CI (no es secreta).
// - La clave privada se guarda cifrada con la clave de acceso (PBKDF2-SHA256 + AES-GCM): solo quien
//   conoce la clave puede abrirla en el navegador. La clave de acceso no se guarda en el repositorio.
// Uso (una vez, o para cambiar la clave):  CLAVE_SITIO='...' node scripts/acceso-generar.mjs
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const clave = process.env.CLAVE_SITIO;
if (!clave || clave.length < 8) {
  console.error('Definir CLAVE_SITIO (mínimo 8 caracteres).');
  process.exit(1);
}
const b64 = (b) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString('base64');
const ITERACIONES = 600000;

const par = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt'],
);
const publica = await crypto.subtle.exportKey('spki', par.publicKey);
const privada = await crypto.subtle.exportKey('pkcs8', par.privateKey);

const sal = crypto.getRandomValues(new Uint8Array(16));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const privadaCifrada = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, privada);

const acceso = {
  v: 1,
  nota: 'Clave pública para cifrar el sitio y clave privada cifrada con la clave de acceso. Ver scripts/acceso-generar.mjs.',
  kdf: { nombre: 'PBKDF2', hash: 'SHA-256', iteraciones: ITERACIONES, sal: b64(sal) },
  privada: { alg: 'RSA-OAEP-256', iv: b64(iv), datos: b64(privadaCifrada) },
  publica: { alg: 'RSA-OAEP-256', spki: b64(publica) },
};
writeFileSync(new URL('./acceso.json', import.meta.url), JSON.stringify(acceso, null, 2) + '\n');
console.log('scripts/acceso.json generado');
