import type { Engine } from '../../sim/engine';
import { locale, t, ts } from '../../i18n';

export const fmt = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
export const fmtInt = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString(locale()) : '—');

export function tiempoSim(t: number) {
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `D${d} ${p(h)}:${p(m)}:${p(s)}`;
}

export function duracion(s: number) {
  if (!Number.isFinite(s)) return '—';
  if (s < 120) return `${Math.round(s)} s`;
  if (s < 7200) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export type EstadoVisual = 'on' | 'off' | 'moving' | 'trip' | 'unk';

/** Estado de una válvula on/off según lo que ve el PLC (finales de carrera) y su discrepancia. */
export function estadoValvula(e: Engine, tag: string): EstadoVisual {
  const b = e.plc.valvulas.get(tag);
  if (!b) return 'unk';
  if (b.zao || b.zac || (b.zso && b.zsc)) return 'trip';
  if (b.zso) return 'on';
  if (b.zsc) return 'off';
  return 'moving';
}

export function estadoMotor(e: Engine, tag: string): EstadoVisual {
  const b = e.plc.motores.get(tag);
  if (!b) return 'unk';
  if (b.flt || b.fts || !b.cp) return 'trip';
  return b.run ? 'on' : 'off';
}

/** Válvula manual abierta (las retenciones VCH abren solas con caudal del soplante). */
export function manualAbierta(e: Engine, tag: string): boolean {
  if (tag.includes('-VCH-')) return e.planta.soplantes.some((s) => s.vRetencion === tag && s.retencionAbierta);
  return e.planta.manuales[tag] ?? true;
}

/** Lectura de indicadores locales sin I/O (manómetros PI de soplantes, con aislamiento y venteo). */
export function lecturaLocal(e: Engine, tag: string) {
  const s = e.planta.soplantes.find((x) => x.pi === tag);
  return { eu: s ? s.piLectura : NaN, mA: NaN, mala: false };
}

// Textos en español (clave de t()); traducir al mostrar con t(ESTADO_TXT[x]) o estadoTxt(x).
export const ESTADO_TXT: Record<EstadoVisual, string> = { on: 'Marcha/abierta', off: 'Parada/cerrada', moving: 'En recorrido', trip: 'Falla/disparo', unk: 'Sin dato' };
export const estadoTxt = (e: EstadoVisual) => t(ESTADO_TXT[e]);

/** Grupo de alarma o de serie del historiador (texto generado por la simulación). */
export function grupoTxt(g: string) {
  const m = /^Filtro ([A-D])$/.exec(g);
  return m ? t('Filtro {l}', { l: m[1] }) : ts(g);
}

const SERIES_FILTRO = /^(Nivel filtro|Caudal filtrado|Paso de secuencia|Sólidos retenidos|Cloro libre filtro|Capacidad oxidativa) ([A-D])$/;

/** Etiqueta de una serie del historiador (definidas en sim/engine.ts). */
export function serieTxt(label: string) {
  const m = SERIES_FILTRO.exec(label);
  return m ? t(`${m[1]} {l}`, { l: m[2] }) : ts(label);
}

/** Unidad de una serie: solo 'paso' es texto; el resto son símbolos. */
export const unidadTxt = (u: string) => (u === 'paso' ? t('paso') : u);

/** Copia texto al portapapeles con respaldo de selección manual. */
export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export const LETRAS = ['A', 'B', 'C', 'D'];
