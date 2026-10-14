// Cobertura de la versión en inglés (/en): textos de interfaz, datos de los JSON y textos de la simulación.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { idiomaDeRuta, traducirDato, traducirSim } from '../src/i18n';
import { UI_EN } from '../src/i18n/ui';
import { ESCENARIOS_EN, GRUPOS_PARAM_EN, PARAMS_EN } from '../src/i18n/sim';
import { Engine, ESCENARIOS } from '../src/sim/engine';
import { PARAM_DEFS } from '../src/sim/params';

const raiz = join(__dirname, '..');

function archivos(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p, ext) : ext.test(f) ? [p] : [];
  });
}

/** Primer argumento literal de cada llamada t('…') / t("…") / t(`…`) sin interpolación JS. */
function clavesT(src: string): string[] {
  const out: string[] = [];
  const re = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
  for (const m of src.matchAll(re)) out.push((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
  return out;
}

/** Texto en castellano (heurística): tildes/ñ o palabras funcionales frecuentes. */
const ES = /[áéíóúñÁÉÍÓÚÑ¿¡]|\b(de|del|la|las|los|el|por|con|sin|para|nivel|filtro|válvula|entrada|salida|falla|tanque|agua|aire|bomba|bombas|abierta|cerrada|marcha|según|otros|soplante|soplantes|compresor|compresores|drenaje|aislamiento|desde|hacia|caudal|lavado|retrolavado|sumidero|tablero|paso|pasos|tiempo|carga|cargas|colector|retención|mariposa|bola)\b/i;

describe('i18n – rutas', () => {
  test('/en activa inglés; el resto, castellano', () => {
    expect(idiomaDeRuta('/en')).toBe('en');
    expect(idiomaDeRuta('/en/')).toBe('en');
    expect(idiomaDeRuta('/en/index.html')).toBe('en');
    expect(idiomaDeRuta('/')).toBe('es');
    expect(idiomaDeRuta('/index.html')).toBe('es');
    expect(idiomaDeRuta('/english')).toBe('es');
  });
});

describe('i18n – interfaz', () => {
  const fuentes = archivos(join(raiz, 'src'), /\.tsx?$/).filter((f) => !f.includes(`${join('src', 'i18n')}`));

  test('cada t(\'…\') literal tiene traducción', () => {
    const faltan = new Set<string>();
    for (const f of fuentes) for (const k of clavesT(readFileSync(f, 'utf8'))) if (UI_EN[k] === undefined) faltan.add(k);
    expect([...faltan]).toEqual([]);
  });

  test('las variables {x} coinciden entre castellano e inglés', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const mal = Object.entries(UI_EN).filter(([es, en]) => vars(es) !== vars(en)).map(([es]) => es);
    expect(mal).toEqual([]);
  });
});

describe('i18n – datos (data/*.json)', () => {
  // claves internas que no se muestran como texto
  const ignorarClave = new Set(['id', 'kind', 'zona', 'tipo_senal', 'unidad']);
  const textos = new Map<string, string>();
  const recorrer = (v: unknown, f: string, k: string) => {
    if (typeof v === 'string') {
      if (!ignorarClave.has(k) && ES.test(v)) textos.set(v, `${f}:${k}`);
    } else if (Array.isArray(v)) v.forEach((x) => recorrer(x, f, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) recorrer(vv, f, kk);
  };
  for (const f of readdirSync(join(raiz, 'data')).filter((x) => x.endsWith('.json'))) recorrer(JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8')), f, '');

  test('todo texto en castellano de los JSON tiene traducción', () => {
    const faltan = [...textos].filter(([s]) => traducirDato(s) === null).map(([s, d]) => `${d} → ${s}`);
    expect(faltan).toEqual([]);
  });
});

describe('i18n – simulación', () => {
  test('parámetros, grupos y escenarios', () => {
    expect(PARAM_DEFS.filter((d) => !PARAMS_EN[d.key]).map((d) => d.key)).toEqual([]);
    expect(PARAM_DEFS.filter((d) => d.nota && !PARAMS_EN[d.key]?.nota).map((d) => d.key)).toEqual([]);
    expect([...new Set(PARAM_DEFS.map((d) => d.group))].filter((g) => !GRUPOS_PARAM_EN[g])).toEqual([]);
    expect(ESCENARIOS.filter((x) => !ESCENARIOS_EN[x.id]).map((x) => x.id)).toEqual([]);
  });

  test('alarmas configuradas, historial, HOLD, motivos y bloqueos', { timeout: 60000 }, () => {
    const vistos = new Set<string>();
    const juntar = (e: Engine) => {
      for (const a of e.plc.alarmas.estados.values()) vistos.add(a.def.texto);
      for (const h of e.plc.alarmas.historial) vistos.add(h.texto);
      for (const f of e.plc.filtros) {
        if (f.holdCausa) vistos.add(f.holdCausa);
        if (f.ultimoMotivoLavado) vistos.add(f.ultimoMotivoLavado);
      }
      for (const m of e.plc.motores.values()) if (m.bloqueo) vistos.add(m.bloqueo);
    };
    const lav = new Engine('lavado');
    for (let k = 0; k < 400; k++) {
      lav.avanzar(10);
      juntar(lav);
    }
    const fallas = new Engine('normal');
    fallas.setFallaGlobal('dc24', true);
    fallas.setMotorFalla('16045-CM-30011', 'falla', true);
    fallas.setParam('q_RO_m3h', 0);
    fallas.setParam('q_HDS_m3h', 0);
    fallas.avanzar(600);
    juntar(fallas);
    fallas.cmd({ tipo: 'reset_disparos' });
    fallas.avanzar(5);
    juntar(fallas);
    const faltan = [...vistos].filter((s) => ES.test(s) && traducirSim(s) === null);
    expect(faltan).toEqual([]);
  });
});
