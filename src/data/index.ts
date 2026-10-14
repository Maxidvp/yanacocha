// Carga tipada de los JSON de planta (fuente de verdad: /data). No copiar valores a mano en el código.
import equiposRaw from '../../data/equipos.json';
import instrumentosRaw from '../../data/instrumentos.json';
import valvulasRaw from '../../data/valvulas.json';
import senalesRaw from '../../data/senales_io.json';
import electricoRaw from '../../data/electrico.json';
import procesoRaw from '../../data/proceso_y_logica.json';
import alarmasRaw from '../../data/alarmas.json';
import causaEfectoRaw from '../../data/causa_efecto.json';
import layoutRaw from '../../data/layout.json';
import soeRaw from '../../data/soe.json';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface Equipo {
  tag: string;
  nombre: string;
  tipo?: string;
  [k: string]: Json | undefined;
}

export interface FiltroEquipo extends Equipo {
  dimensiones: { largo_m: number; ancho_m: number; alto_m: number };
  area_filtracion_m2: number;
  medios: { capa: string; volumen_m3: number; espesor_m: number }[];
  transmisor_nivel: string;
  valvulas: Record<FuncionValvula, string>;
  rio: string;
  caja_conexion: string;
  caudales: {
    servicio_diseno_m3h: number;
    servicio_max_m3h: number;
    servicio_min_m3h: number;
    retrolavado_m3h: number;
    retrolavado_presion_barg: number;
    aire_scour_Nm3h: number;
    recirculacion_regen_m3h: number;
    dosis_NaOCl_12_5pct_Lh: number;
    dosis_tiempo_min: number;
  };
  niveles_mm: { HH: number; H: number; L: number; LL: number; drenaje_K06: number; llenado_K09: number; normal_servicio: string };
}

/** Funciones de válvula de filtro. En equipos.json la RO/RW figura como "FRO". */
export type FuncionValvula = 'SEVI' | 'RI' | 'BWO' | 'FRO' | 'BWI' | 'SEVO' | 'AIRI';
export const FUNCIONES_VALVULA: FuncionValvula[] = ['SEVI', 'RI', 'BWO', 'FRO', 'BWI', 'SEVO', 'AIRI'];
/** Nombre de columna en la matriz de la secuencia (proceso_y_logica.json). */
export const COLUMNA_SECUENCIA: Record<FuncionValvula, string> = {
  SEVI: 'SEVI', RI: 'RI', BWO: 'BWO', FRO: 'RO/RW', BWI: 'BWI', SEVO: 'SEVO', AIRI: 'AIRI',
};

export interface Instrumento {
  tag: string;
  tipo?: string;
  modelo?: string;
  servicio?: string;
  rango_cal?: [number, number] | string;
  unidad?: string;
  senal?: string;
  alarmas?: Record<string, Json> | string;
  [k: string]: Json | undefined;
}

export interface Valvula {
  tag: string;
  funcion: string;
  descripcion: string;
  filtro?: string;
  tipo: string;
  tamano_in?: number;
  falla_aire?: string;
  tiempo_carrera_s?: string;
  senales?: Record<string, string>;
  rio?: string;
  estado_inicial?: string;
  [k: string]: Json | undefined;
}

export interface SenalIO {
  tag: string;
  descripcion: string;
  tipo_senal: 'AI' | 'AO' | 'DI' | 'DO' | 'DI(com)';
  modulo_rio?: string;
  servicio?: string;
  equipo?: string;
  fuente?: string;
}

export interface Carga {
  item: number;
  tag: string;
  desc: string;
  tipo: string;
  arranque?: string;
  kW_abs?: number;
  kW_nom?: number;
  servicio?: string;
  clase: string;
  V: number;
  ef?: number;
  fp?: number;
  rpm?: number;
  consumo?: string;
}

export interface PasoSecuencia {
  paso: number;
  nombre: string;
  timer: string | null;
  transicion_nivel: string | null;
  valvulas: Record<string, 'O' | 'C'>;
  equipos: Record<string, string>;
  nota: string;
}

export interface AlarmaAnalogicaDef {
  HH?: number | string;
  H?: number | string;
  L?: number | string;
  LL?: number | string;
  normal?: number | string;
  retardo_s?: number | Record<string, number>;
  activa?: string;
  nota?: string;
  alcance?: string;
}

export interface CausaEfecto {
  linea: number;
  causa: string;
  instrumento: string;
  alarma_impresa: string;
  pid: string;
  nota?: string;
  efectos: Record<string, 'T' | 'X'>;
}

export type EstadoSOE = 'O' | 'Cl' | 'X' | 'ON' | 'Off' | 'ST' | 'SP';
export interface PasoSOE {
  paso: number;
  nombre: string;
  preset: string;
  preset_s: number | null;
  entrada_m3h: number;
  aire_Nm3h: number;
  retrolavado_m3h: number;
  valvulas: Record<string, EstadoSOE>;
  comunes: Record<string, EstadoSOE>;
}

export interface LayoutItem {
  tag: string;
  label?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  kind: string;
  rot?: number;
  nota?: string;
}

export interface LayoutArea {
  id: string;
  titulo: string;
  plano: string;
  /** Rectángulos [x, y, ancho, alto] en m que delimitan el área. */
  zonas: [number, number, number, number][];
  items: LayoutItem[];
  instrumentos: { tag: string; x: number; y: number; el?: number }[];
}

const asArr = <T,>(x: unknown) => x as T[];

export const equipos = asArr<Equipo>(equiposRaw);
export const filtrosEquipo = equipos.filter((e) => e.tipo === 'filtro_gravedad') as unknown as FiltroEquipo[];
export const instrumentos = asArr<Instrumento>(instrumentosRaw);
export const valvulas = asArr<Valvula>(valvulasRaw);
export const senales = senalesRaw as unknown as {
  _nota: string;
  resumen: Record<string, number>;
  io_documentada: SenalIO[];
  io_motores: SenalIO[];
  modos_motor: Record<string, string>;
};
export const electrico = electricoRaw as unknown as {
  sistema: Record<string, string | number>;
  cargas: Carga[];
  leyenda: Record<string, Record<string, string>>;
  tablero_instrumentos: { tag: string; entrada: string; fuente_24VDC: string; protecciones: string[]; alimenta: string; fuente: string };
  cajas_conexion: { tag?: string; servicio?: string; clase?: string; nota?: string }[];
  estaciones_locales: { equipos: string[]; contenido: string; fuente: string };
  convenciones: Record<string, Json>;
  aire_instrumentos: { presion_min_kPag: number; nominal_psig: number; consumo_prom_Nm3h: number; consumo_pico_Nm3h: number; fuente: string };
};
export const proceso = procesoRaw as unknown as {
  _fuente: string;
  condiciones_sitio: { altitud_m: string; p_atm_bar_abs: number; t_amb_C: [number, number] };
  calidad_agua_entrada: Record<string, string | number>;
  base_diseno: Record<string, string | number>;
  flujo_proceso: string[];
  control_bypass: {
    controlador: string;
    calculo_SP: string;
    capacidad_segun_filtros_fuera: Record<string, number>;
    modo: string;
    rango_FV_m3h: [number, number];
    objetivo: string;
    tabla_escenarios: { entrada: number; filtros: number; bypass: number; en_servicio: number; por_filtro: number; nota?: string }[];
  };
  compresores: Record<string, string>;
  agitadores: Record<string, string>;
  soplantes: Record<string, string>;
  filtros: {
    modos: Record<string, string>;
    botones_PCS: string[];
    parametros: Record<string, [number, number, number] | number | string>;
    permisivo_lavado: string;
    logica_maestra: Record<string, string>;
    hold: { causas_proceso: string[]; causas_dispositivo: string; acciones: string; resume: string; abortar: string };
    condicion_anormal_nivel: string;
    secuencia: PasoSecuencia[];
    arranque_inicial: string;
  };
  secundario: Record<string, string>;
  comisionamiento: Record<string, string>;
};
export const alarmas = alarmasRaw as unknown as {
  fuente: string;
  analogicas: Record<string, AlarmaAnalogicaDef>;
  filtros_nivel_mm: { HH: number; H: number; L: number; LL: number };
  digitales: { tag: string; descripcion: string; retardo_s: number }[];
  nota: string;
};
export const causaEfecto = causaEfectoRaw as unknown as {
  fuente: string;
  estado: string;
  leyenda: Record<string, string>;
  efectos: Record<string, string>;
  efectos_detalle: Record<string, { columna: number; descripcion_original: string; tag: string; pid: string; nota?: string }>;
  causas: CausaEfecto[];
  notas_originales: string[];
  nota: string;
};
export const soe = soeRaw as unknown as {
  fuente: string;
  columnas: { valvulas: Record<string, string>; comunes: Record<string, string>; caudales: Record<string, string> };
  leyenda: Record<string, string>;
  pasos: PasoSOE[];
  hold: { nombre: string; valvulas: Record<string, EstadoSOE>; comunes: Record<string, EstadoSOE> };
  notas_originales: string[];
  diferencias_con_filosofia: string[];
};
export const layout = layoutRaw as unknown as { _fuente: string; _nota: string; cota_planta_m: number; ancho_m: number; alto_m: number; areas: LayoutArea[] };

export const instrumentoPorTag = (tag: string) => instrumentos.find((i) => i.tag === tag);
export const equipoPorTag = (tag: string) => equipos.find((e) => e.tag === tag);
export const valvulaPorTag = (tag: string) => valvulas.find((v) => v.tag === tag);
export const cargaPorTag = (tag: string) => electrico.cargas.find((c) => c.tag === tag);

/** Rango de calibración numérico de un instrumento, o null si está A CONFIRMAR. */
export function rangoInstrumento(tag: string): [number, number] | null {
  const r = instrumentoPorTag(tag)?.rango_cal;
  return Array.isArray(r) ? (r as [number, number]) : null;
}

/** Retardo (s) de una alarma analógica para un nivel dado. */
export function retardoAlarma(def: AlarmaAnalogicaDef | undefined, nivel: string): number {
  if (!def || def.retardo_s === undefined) return 5;
  if (typeof def.retardo_s === 'number') return def.retardo_s;
  return def.retardo_s[nivel] ?? 5;
}

export const LETRA_FILTRO = ['A', 'B', 'C', 'D'] as const;

/** Detecta valores pendientes de confirmación en un texto de datos. */
export const esAConfirmar = (v: unknown) => typeof v === 'string' && /A CONFIRMAR|por Bechtel|incoherente|invertido/i.test(v);
