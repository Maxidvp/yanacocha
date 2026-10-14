// Capa de I/O: tabla de tags exactamente como senales_io.json + interfaz con sistemas de otros.
// El proceso escribe entradas (lado campo) y lee salidas; el PLC lee entradas y escribe salidas.
// Un forzado reemplaza el valor que ve el destino (PLC para entradas, campo para salidas).
import { senales } from '../../data';
import { rangoAI, type Params } from '../params';

export type TipoIO = 'AI' | 'AO' | 'DI' | 'DO' | 'DI(com)' | 'COM-AI' | 'COM-DI' | 'COM-DO';
export type GrupoIO = 'documentada' | 'motor' | 'otros';

export interface PuntoIO {
  tag: string;
  descripcion: string;
  tipo: TipoIO;
  grupo: GrupoIO;
  rio?: string;
  equipo?: string;
  unidad?: string;
  /** valor en origen: mA (AI/AO), 0/1 (digitales) o unidad de ingeniería (COM-AI) */
  origen: number;
  forzado: boolean;
  valorForzado: number;
}

export const esEntrada = (t: TipoIO) => t === 'AI' || t === 'DI' || t === 'DI(com)' || t === 'COM-AI' || t === 'COM-DI';
export const esAnalogica = (t: TipoIO) => t === 'AI' || t === 'AO' || t === 'COM-AI';

const UNIDAD_AI: Record<string, string> = {
  'LIT-160305604': 'mm', 'LIT-160305615': 'mm', 'LIT-160305623': 'mm', 'LIT-160305631': 'mm', 'LIT-160305601': 'mm',
  'FIT-160305602': 'Nm³/h', 'FIT-160305607': 'Nm³/h', 'FIT-160305603': 'm³/h', 'AIT-160305600': 'pH',
  'AIT-160305442': 'µS/cm', 'FZI-160305603': '%', 'FCV-160305603': '%',
};

/** Señales de interfaz con sistemas de otros (mismo PLC Rockwell del cliente). Tags EXT-* son nombres del simulador. */
export const IO_OTROS: Omit<PuntoIO, 'origen' | 'forzado' | 'valorForzado'>[] = [
  { tag: 'FIC-160305065', descripcion: 'Caudal permeado RO a TK-30015 (por otros) → FY-160305603', tipo: 'COM-AI', grupo: 'otros', unidad: 'm³/h' },
  { tag: 'FIC-160304333', descripcion: 'Caudal agua tratada HDS a TK-30015 (por otros) → FY-160305603', tipo: 'COM-AI', grupo: 'otros', unidad: 'm³/h' },
  { tag: 'LIT-160305276', descripcion: 'Nivel TK-30016 (por otros; filosofía cita LIT-160305545)', tipo: 'COM-AI', grupo: 'otros', unidad: 'mm' },
  { tag: 'AIT-160305288', descripcion: 'pH TK-30016 (por otros)', tipo: 'COM-AI', grupo: 'otros', unidad: 'pH' },
  { tag: 'EXT-FI-RETROLAVADO', descripcion: 'Caudal de retrolavado (por otros)', tipo: 'COM-AI', grupo: 'otros', unidad: 'm³/h' },
  { tag: 'EXT-LI-TK30038', descripcion: 'Nivel sumidero de regeneración TK-30038 (por otros)', tipo: 'COM-AI', grupo: 'otros', unidad: '%' },
  { tag: 'EXT-PU-30407-08-AVL', descripcion: 'Bombas de retrolavado PU-30407/08 disponibles', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30407-08-RUN', descripcion: 'Bomba de retrolavado en marcha', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30407-08-REQ', descripcion: 'Pedido de bomba de retrolavado (secuencia paso 10)', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-PU-30169-70-AVL', descripcion: 'Bombas de regeneración PU-30169/70 disponibles', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30169-70-RUN', descripcion: 'Bomba de regeneración en marcha', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30169-70-REQ', descripcion: 'Pedido de bomba de regeneración (pasos 12–13)', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-PU-30236-37-AVL', descripcion: 'Bombas NaOCl PU-30236/37 disponibles', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30236-37-RUN', descripcion: 'Bomba NaOCl en marcha', tipo: 'COM-DI', grupo: 'otros' },
  { tag: 'EXT-PU-30236-37-REQ', descripcion: 'Pedido de dosificación NaOCl (paso 13)', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-E1-STOP-RO', descripcion: 'C&E E1: parar bombas permeado RO PU-30084/30085/30214', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-E2-STOP-HDS', descripcion: 'C&E E2: parar bombas transferencia HDS PU-30401/30402', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-E4-STOP-ACIDO', descripcion: 'C&E E4: parar dosificación de ácido', tipo: 'COM-DO', grupo: 'otros' },
  { tag: 'EXT-E5-STOP-SODA', descripcion: 'C&E E5: parar dosificación de soda', tipo: 'COM-DO', grupo: 'otros' },
];

export class TablaIO {
  readonly puntos: PuntoIO[] = [];
  private idx = new Map<string, PuntoIO>();

  constructor(public params: Params) {
    for (const s of senales.io_documentada) {
      this.agregar({ tag: s.tag, descripcion: s.descripcion, tipo: s.tipo_senal, grupo: 'documentada', rio: s.modulo_rio, equipo: s.equipo, unidad: UNIDAD_AI[s.tag] });
    }
    for (const s of senales.io_motores) {
      this.agregar({ tag: s.tag, descripcion: s.descripcion, tipo: s.tipo_senal, grupo: 'motor', equipo: s.equipo });
    }
    for (const s of IO_OTROS) this.agregar(s);
  }

  private agregar(p: Omit<PuntoIO, 'origen' | 'forzado' | 'valorForzado'>) {
    if (this.idx.has(p.tag)) return;
    const q: PuntoIO = { ...p, origen: p.tipo === 'AI' || p.tipo === 'AO' ? 4 : 0, forzado: false, valorForzado: 0 };
    this.puntos.push(q);
    this.idx.set(p.tag, q);
  }

  punto(tag: string): PuntoIO {
    const p = this.idx.get(tag);
    if (!p) throw new Error(`Tag de I/O inexistente: ${tag}`);
    return p;
  }

  tiene(tag: string) {
    return this.idx.has(tag);
  }

  /** Valor visto por el destino (aplica forzado). */
  valor(tag: string): number {
    const p = this.punto(tag);
    return p.forzado ? p.valorForzado : p.origen;
  }

  // ---- lado campo ----
  escribirCampo(tag: string, v: number | boolean) {
    const p = this.punto(tag);
    p.origen = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  /** Escribe una AI en unidades de ingeniería → mA (saturación NAMUR NE43 3.8–20.5 mA). */
  escribirAI(tag: string, eu: number) {
    const [lo, hi] = rangoAI(tag, this.params);
    const mA = 4 + (16 * (eu - lo)) / (hi - lo);
    this.punto(tag).origen = Math.min(20.5, Math.max(3.8, mA));
  }
  /** Escribe una AI directamente en mA (fallas de lazo). */
  escribirAImA(tag: string, mA: number) {
    this.punto(tag).origen = mA;
  }
  leerSalida(tag: string): boolean {
    return this.valor(tag) >= 0.5;
  }
  leerAOmA(tag: string): number {
    return this.valor(tag);
  }

  // ---- lado PLC ----
  di(tag: string): boolean {
    return this.valor(tag) >= 0.5;
  }
  /** AI en unidades de ingeniería con calidad (NE43: < 3.6 o > 21 mA = falla). */
  ai(tag: string): { eu: number; mA: number; mala: boolean } {
    const p = this.punto(tag);
    const v = p.forzado ? p.valorForzado : p.origen;
    if (p.tipo === 'COM-AI') return { eu: v, mA: NaN, mala: false };
    const [lo, hi] = rangoAI(tag, this.params);
    const mala = v < 3.6 || v > 21;
    return { eu: lo + ((Math.min(20, Math.max(4, v)) - 4) / 16) * (hi - lo), mA: v, mala };
  }
  escribirDO(tag: string, v: boolean) {
    this.punto(tag).origen = v ? 1 : 0;
  }
  escribirAO(tag: string, pct: number) {
    this.punto(tag).origen = 4 + (16 * Math.min(100, Math.max(0, pct))) / 100;
  }
  escribirCOM(tag: string, v: number | boolean) {
    this.escribirCampo(tag, v);
  }

  /** EU visible de cualquier punto (para HMI). */
  euVisible(p: PuntoIO): number {
    const v = p.forzado ? p.valorForzado : p.origen;
    if (p.tipo === 'AI' || p.tipo === 'AO') {
      const [lo, hi] = p.tipo === 'AO' ? [0, 100] : rangoAI(p.tag, this.params);
      return lo + ((Math.min(20.5, Math.max(3.8, v)) - 4) / 16) * (hi - lo);
    }
    return v;
  }

  forzar(tag: string, valor: number) {
    const p = this.punto(tag);
    p.forzado = true;
    p.valorForzado = valor;
  }
  liberar(tag: string) {
    this.punto(tag).forzado = false;
  }
  liberarTodo() {
    for (const p of this.puntos) p.forzado = false;
  }
  get forzados() {
    return this.puntos.filter((p) => p.forzado);
  }
}
