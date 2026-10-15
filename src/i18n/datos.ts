// Traducción (es → en) de los valores de texto de data/*.json.
// - DATOS_GEN_EN: diccionario exacto generado desde los JSON (datos_gen.ts).
// - PATRONES_DATOS: familias repetidas por filtro / válvula / motor.
// - FRASES_EN: fragmentos dentro de referencias documentales.
// - CAMPOS_EN: nombres de las claves de los JSON para las fichas técnicas.
import { DATOS_GEN_EN } from './datos_gen';
import { DATOS_V3_EN } from './datos_v3';

type Patron = [RegExp, string | ((...m: string[]) => string)];

export const DATOS_EN: Record<string, string> = {
  ...DATOS_GEN_EN,
  ...DATOS_V3_EN,
  'Presión descarga BL-30008': 'BL-30008 discharge pressure',
  'Presión descarga BL-30009': 'BL-30009 discharge pressure',
  '127 (138 en PRV)': '127 (138 at PRV)',
  motor: 'motor',
  'P-00260-DW-AE-001P-C-EAST (estación de bypass FV-160305603)': 'P-00260-DW-AE-001P-C-EAST (FV-160305603 bypass station)',
  'Aguas arriba de la estación FIT-160305603 / FV-160305603 (aislamiento de entrada)': 'Upstream of the FIT-160305603 / FV-160305603 station (inlet isolation)',
  'Entre VBF-309704 y FIT-160305603 (drenaje de ½″)': 'Between VBF-309704 and FIT-160305603 (½″ drain)',
  'Entre FV-160305603 y VBF-309708 (drenaje de ½″)': 'Between FV-160305603 and VBF-309708 (½″ drain)',
  'Aguas abajo de la estación FIT-160305603 / FV-160305603 (aislamiento de salida)': 'Downstream of the FIT-160305603 / FV-160305603 station (outlet isolation)',
  'Línea paralela de 24″ que rodea VBF-309704, FIT-160305603, FV-160305603 y VBF-309708': 'Parallel 24″ line bypassing VBF-309704, FIT-160305603, FV-160305603 and VBF-309708',
  'Asignación al soplante por numeración consecutiva del tren de descarga (VCH, PI, VBF) – A CONFIRMAR con el P&ID': 'Assigned to the blower by the consecutive numbering of the discharge train (VCH, PI, VBF) – TO BE CONFIRMED with the P&ID',
  MANUAL: 'MANUAL',
};

const VALV_FILTRO: Record<string, string> = {
  'Entrada de servicio (agua de tanque primario)': 'Service inlet (primary TW tank water)',
  'Entrada de regeneración (solución de regeneración (NaOCl inyectado en recirculación, 137 m3/h))': 'Regeneration inlet (regeneration solution (NaOCl injected into recirculation, 137 m3/h))',
  'Salida de retrolavado → sumidero de desecho de retrolavado': 'Backwash outlet → backwash waste sump',
  'Salida de enjuague / desecho de regeneración → colector RO/RW → sumidero de regeneración': 'Rinse / regeneration waste outlet → RO/RW header → regeneration sump',
  'Entrada de agua de retrolavado (desde bomba de retrolavado, por otros)': 'Backwash water inlet (from backwash pump, by others)',
  'Salida de servicio (agua filtrada) a colector / sumidero de agua filtrada': 'Service outlet (filtered water) to header / filtered water sump',
  'Entrada de aire de lavado (air scour) desde soplantes': 'Air scour inlet from blowers',
};

const SERV_CM: Record<string, string> = {
  'DP filtro aire entrada': 'Inlet air filter DP',
  'Nivel visor tanque aceite': 'Oil tank sight glass level',
  'Presión circuito aceite': 'Oil circuit pressure',
  'Presión descarga compresor': 'Compressor discharge pressure',
  'Solenoide carga/descarga (Y1)': 'Load/unload solenoid (Y1)',
  'Temp. descarga compresor': 'Compressor discharge temp.',
  'Temp. devanado motor U': 'Motor winding temp. U',
  'Temp. devanado motor V': 'Motor winding temp. V',
  'Temp. devanado motor W': 'Motor winding temp. W',
  'Temp. rodamiento motor LA': 'Motor bearing temp. DE',
  'Temp. rodamiento motor LOA': 'Motor bearing temp. NDE',
};

const ESTADO_DI: Record<string, string> = { abierta: 'open', cerrada: 'closed', 'comando solenoide (1=abrir)': 'solenoid command (1=open)', comando: 'command' };

export const PATRONES_DATOS: Patron[] = [
  [/^Filtro ([A-D]) válvula ([\w/]+) – (abierta|cerrada|comando solenoide \(1=abrir\))$/, (_, l, v, e) => `Filter ${l} ${v} valve – ${ESTADO_DI[e]}`],
  [/^Nivel filtro ([A-D])$/, (_, l) => `Filter ${l} level`],
  [/^Nivel filtro ([A-D]) \((16045-FL-\d+)\)$/, (_, l, tag) => `Filter ${l} level (${tag})`],
  [/^Filtro ([A-D]): (.+)$/, (m, l, d) => (VALV_FILTRO[d] ? `Filter ${l}: ${VALV_FILTRO[d]}` : m)],
  [/^Drenaje filtro ([A-D]) → colector desecho$/, (_, l) => `Filter ${l} drain → waste header`],
  [/^Filtro de medio activo \(gravedad\) ([A-D])$/, (_, l) => `Active media filter (gravity) ${l}`],
  [/^(HV-\d+) falla al (abrir|cerrar)$/, (_, tag, a) => `${tag} failed to ${a === 'abrir' ? 'open' : 'close'}`],
  [/^(16045-\w+-\d+) falla al arrancar$/, (_, tag) => `${tag} failed to start`],
  [/^Secuenciador (16045-FL-\d+) \(pasos 0–16 \+ HOLD\)$/, (_, tag) => `${tag} sequencer (steps 0–16 + HOLD)`],
  [/^(LAHH-\d+) nivel filtro (\d+)$/, (_, a, f) => `${a} filter ${f} level`],
  [/^(HV-\d+) (abierta|cerrada|comando)$/, (_, tag, e) => `${tag} ${ESTADO_DI[e]}`],
  [/^(Aislamiento|Drenaje) (PI-\d+)$/, (_, a, tag) => `${tag} ${a === 'Aislamiento' ? 'isolation' : 'drain'}`],
  [/^(.+) – (16045-CM-\d+)$/, (m, s, tag) => (SERV_CM[s] ? `${SERV_CM[s]} – ${tag}` : m)],
  [/^Líneas? ([\d–]+): (ZS[OC](?:\/ZSC)?-\d+) con alarmas? (ZA[OC](?:\/ZAC)?-\d+)$/, (_, n, zs, za) => `Line${n.includes('–') ? 's' : ''} ${n}: ${zs} with alarm${za.includes('/') ? 's' : ''} ${za}`],
  [/^Las líneas (.+) llaman 'Air Inlet' a (.+) y las (.+) 'Backwash Outlet' a (.+) \(cruzado respecto del P&ID rev005 y la I\/O list\)$/, (_, a, b, c, d) => `Lines ${a} call ${b} 'Air Inlet' and lines ${c} call ${d} 'Backwash Outlet' (swapped with respect to P&ID rev005 and the I/O list)`],
];

export const FRASES_EN: [string, string][] = [
  ['(en Training Manual)', '(in Training Manual)'],
  ['Training Manual págs.', 'Training Manual pp.'],
  ['Training Manual pág.', 'Training Manual p.'],
  ['A CONFIRMAR', 'TO BE CONFIRMED'],
  ['(por otros)', '(by others)'],
];

/** Claves de los JSON (fichas técnicas). Las que no figuran se muestran con "_" → " ". */
export const CAMPOS_EN: Record<string, string> = {
  accesorios: 'accessories', activa: 'active when', aire_instrumentos: 'instrument air', aire_scour_Nm3h: 'air scour Nm3h', aireacion: 'aeration',
  alarma_discrepancia: 'discrepancy alarm', alarmas: 'alarms', alcance: 'scope', alimenta: 'feeds', alimentaciones: 'supplies', alto_m: 'height m',
  altura_m: 'height m', ancho_m: 'width m', area_filtracion_m2: 'filtration area m2', arranque: 'starting', boquillas: 'nozzles',
  caja_conexion: 'junction box', cajas_conexion: 'junction boxes', calefactor: 'heater', capa: 'layer', capacidad_Nm3h: 'capacity Nm3h',
  caracteristica: 'characteristic', cargas: 'loads', caudal_Lh: 'flow L/h', caudal_Nm3h: 'flow Nm3h', caudal_entrada_m3h: 'inlet flow m3h',
  caudal_m3h: 'flow m3h', caudal_req_Nm3h: 'required flow Nm3h', caudales: 'flows', clase: 'class', comando: 'command', consumo: 'consumption',
  consumo_pico_Nm3h: 'peak consumption Nm3h', consumo_prom_Nm3h: 'average consumption Nm3h', contenido: 'content', control: 'control',
  control_nivel: 'level control', controlador: 'controller', convenciones: 'conventions', cv_req: 'required Cv', desc: 'description',
  descarga_kPa_abs: 'discharge kPa abs', descripcion: 'description', diametro_m: 'diameter m', difusor: 'diffuser', dimensiones: 'dimensions',
  diseno_planta: 'plant design', disparo: 'trip', dosis_NaOCl_12_5pct_Lh: 'NaOCl 12.5 % dose L/h', dosis_tiempo_min: 'dosing time min',
  dp_kPa: 'dp kPa', drenaje_K06: 'drain-down K06', ef: 'effect', entrada: 'inlet', equipos: 'equipment', espesor_m: 'thickness m',
  estaciones_locales: 'local stations', estado_inicial: 'initial state', fabricante: 'manufacturer', falla: 'failure', falla_aire: 'air failure',
  falla_segura: 'fail-safe', filtro: 'filter', fluido: 'fluid', fp: 'pf', frecuencia_Hz: 'frequency Hz', fuente: 'source', fuente_24VDC: '24 VDC supply',
  fuente_alarmas: 'alarm source', funcion: 'function', igual_a: 'same as', impulsores: 'impellers', instrumentos: 'instruments',
  interlock: 'interlock', interlock_PID: 'P&ID interlock', item: 'item', kW_abs: 'kW absorbed', kW_nom: 'kW rated', lamparas: 'lamps',
  largo_m: 'length m', lcs: 'LCS', leyenda: 'legend', llenado_K09: 'refill K09', logica_vendor: 'vendor logic', 'marcha/abierta': 'running/open',
  max: 'max', medios: 'media', min: 'min', minimo: 'minimum', modelo: 'model', modos: 'modes', monofasico: 'single-phase', motor: 'motor',
  nivel: 'level', nivel_diseno_liquido_mm: 'design liquid level mm', niveles_mm: 'levels mm', nombre: 'name', nominal_psig: 'nominal psig',
  normal: 'normal', normal_servicio: 'normal service', nota: 'note', nota_caudal: 'flow note', nota_volumen: 'volume note', optimista: 'optimistic',
  p_entrada_kPag: 'inlet p kPag', 'parada/cerrada': 'stopped/closed', pid: 'P&ID', posicionador: 'positioner', potencia_absorbida_kW: 'absorbed power kW',
  potencia_eje_BHP: 'shaft power BHP', potencia_nominal_kW: 'rated power kW', presion: 'pressure', presion_barg: 'pressure barg',
  presion_descarga_kPa: 'discharge pressure kPa', presion_min_kPag: 'minimum pressure kPag', proceso: 'process', producto: 'product',
  promedio_anual: 'annual average', proteccion_rayo: 'lightning protection', protecciones: 'protections', psv: 'PSV', rango_PID: 'P&ID range',
  rango_cal: 'calibrated range', recirculacion_regen_m3h: 'regeneration recirculation m3h', retardo_s: 'delay s', retrolavado_m3h: 'backwash m3h',
  retrolavado_presion_barg: 'backwash pressure barg', rio: 'river', rpm: 'rpm', rpm_eje: 'shaft rpm', salida_a_filtros: 'outlet to filters',
  senal: 'signal', senales: 'signals', sentido: 'direction', servicio: 'service', servicio_diseno_m3h: 'design service m3h',
  servicio_max_m3h: 'max service m3h', servicio_min_m3h: 'min service m3h', sistema: 'system', solenoide: 'solenoid', succion: 'suction',
  tablero_instrumentos: 'instrument panel', tag: 'tag', tamano_in: 'size in', tarado: 'set pressure', tarado_kPag: 'set pressure kPag',
  temp_descarga_C: 'discharge temp °C', temp_proceso_C: 'process temp °C', tiempo_carrera_s: 'stroke time s', tipo: 'type',
  tope_mecanico: 'mechanical stop', transmisor_nivel: 'level transmitter', ubicacion_en_proceso: 'process location', unidad: 'unit',
  valvulas: 'valves', velocidad: 'speed', velocidad_rpm: 'speed rpm', ventilador_cabina: 'enclosure fan', volumen_m3: 'volume m3',
  volumen_nominal_m3: 'nominal volume m3', volumen_trabajo_m3: 'working volume m3',
};
