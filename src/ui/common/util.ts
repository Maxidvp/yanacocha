import type { Engine } from '../../sim/engine';

export const fmt = (v: number | undefined | null, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
export const fmtInt = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-PE') : '—');

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

export const ESTADO_TXT: Record<EstadoVisual, string> = { on: 'Marcha/abierta', off: 'Parada/cerrada', moving: 'En recorrido', trip: 'Falla/disparo', unk: 'Sin dato' };

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
