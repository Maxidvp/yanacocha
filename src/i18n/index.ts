// Internacionalización: el español es el idioma fuente; el inglés se activa con la ruta /en.
// - t(): textos de la interfaz (diccionario UI) con interpolación {var}.
// - td(): valores provenientes de los JSON de datos (diccionario exacto + patrones).
// - ts(): textos generados por la simulación (alarmas, causas de HOLD, eventos).
// - campo(): nombre legible de una clave de los JSON.
import { UI_EN } from './ui';
import { DATOS_EN, PATRONES_DATOS, CAMPOS_EN, FRASES_EN } from './datos';
import { PATRONES_SIM } from './sim';

export type Idioma = 'es' | 'en';

const RUTA_EN = /^\/en(\/|$)/;

export function idiomaDeRuta(pathname: string): Idioma {
  return RUTA_EN.test(pathname) ? 'en' : 'es';
}

let actual: Idioma = typeof location !== 'undefined' ? idiomaDeRuta(location.pathname) : 'es';

export const getIdioma = () => actual;

export function setIdiomaGlobal(i: Idioma) {
  actual = i;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = i;
    document.title = i === 'en' ? 'AWTP EAST Simulator' : 'Simulador AWTP EAST';
  }
}

/** URL equivalente en el otro idioma (conserva el #pantalla). Devuelve null si la app no está servida en / o /en. */
export function rutaIdioma(i: Idioma): string | null {
  if (typeof location === 'undefined') return null;
  const p = location.pathname;
  const servidaEnRaiz = p === '/' || p === '/index.html' || RUTA_EN.test(p);
  if (!servidaEnRaiz) return null;
  return `${i === 'en' ? '/en' : '/'}${location.hash}`;
}

const interpolar = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`)) : s;

const faltantes = new Set<string>();
function avisar(tipo: string, s: string) {
  if (!import.meta.env?.DEV || faltantes.has(s)) return;
  faltantes.add(s);
  console.warn(`[i18n] falta traducción (${tipo}):`, s);
}

/** Texto de interfaz. La clave es el texto en español. */
export function t(es: string, vars?: Record<string, string | number>): string {
  if (actual === 'es') return interpolar(es, vars);
  const en = UI_EN[es];
  if (en === undefined) avisar('ui', es);
  return interpolar(en ?? es, vars);
}

function aplicarPatrones(s: string, patrones: [RegExp, string | ((...m: string[]) => string)][]): string | null {
  for (const [re, rep] of patrones) {
    if (re.test(s)) {
      re.lastIndex = 0;
      return typeof rep === 'string' ? s.replace(re, rep) : s.replace(re, rep as (...m: string[]) => string);
    }
  }
  return null;
}

/** Reemplaza frases frecuentes dentro de textos mixtos (p. ej. referencias documentales). */
function frases(s: string): string {
  let r = s;
  for (const [es, en] of FRASES_EN) r = r.split(es).join(en);
  return r;
}

/** Traducción en inglés de un valor de datos, o null si no hay. Exportada para los tests. */
export function traducirDato(s: string): string | null {
  if (DATOS_EN[s] !== undefined) return DATOS_EN[s];
  const p = aplicarPatrones(s, PATRONES_DATOS);
  if (p !== null) return p;
  const f = frases(s);
  return f !== s ? f : null;
}

/** Valor proveniente de los JSON de datos. */
export function td(s: string | undefined | null): string {
  if (s === undefined || s === null) return '';
  if (actual === 'es') return s;
  return traducirDato(s) ?? s;
}

/** Traducción en inglés de un texto generado por la simulación, o null. Exportada para los tests. */
export function traducirSim(s: string): string | null {
  const p = aplicarPatrones(s, PATRONES_SIM);
  if (p !== null) return p;
  if (UI_EN[s] !== undefined) return UI_EN[s];
  return traducirDato(s);
}

/** Texto generado por la simulación (alarmas, causas de HOLD, eventos, bloqueos). */
export function ts(s: string | undefined | null): string {
  if (s === undefined || s === null) return '';
  if (actual === 'es') return s;
  const r = traducirSim(s);
  if (r === null) avisar('sim', s);
  return r ?? s;
}

/** Nombre legible de una clave de los JSON (fichas técnicas). */
export function campo(k: string): string {
  if (actual === 'en' && CAMPOS_EN[k]) return CAMPOS_EN[k];
  return k.replace(/_/g, ' ');
}

/** Formato de enteros según idioma. */
export const locale = () => (actual === 'en' ? 'en-US' : 'es-PE');
