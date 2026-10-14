// Convierte dist-single/index.html (documento completo) en un fragmento sin <html>/<head>/<body>,
// apto para publicarse como página autocontenida dentro de un esqueleto HTML provisto por el host.
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada = 'dist-single/index.html', salida = 'dist-single/fragmento.html'] = process.argv.slice(2);
const html = readFileSync(entrada, 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
const quitar = (s, re) => s.replace(re, '');
let h = head;
h = quitar(h, /<meta charset="[^"]*"\s*\/?>/i);
h = quitar(h, /<meta name="viewport"[^>]*>/i);
const title = /<title>[\s\S]*?<\/title>/i.exec(h)?.[0] ?? '';
h = h.replace(title, '');
writeFileSync(salida, `${title}\n${h.trim()}\n${body.trim()}\n`);
console.log(`${salida}: ${(Buffer.byteLength(readFileSync(salida)) / 1024).toFixed(0)} kB`);
