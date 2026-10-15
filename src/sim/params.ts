// Registro de parámetros editables. Los de la filosofía se leen de proceso_y_logica.json;
// los que no están en los documentos se marcan SUPUESTO y los contradictorios A CONFIRMAR.
import { proceso, rangoInstrumento } from '../data';

export type EstadoParam = 'DOC' | 'A_CONFIRMAR' | 'SUPUESTO';

export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  nominal: number;
  min: number;
  max: number;
  step?: number;
  group: string;
  estado: EstadoParam;
  fuente?: string;
  nota?: string;
  /** true = valor booleano (0/1) */
  bool?: boolean;
}

const fp = proceso.filtros.parametros;
const tri = (k: string): [number, number, number] => {
  const v = fp[k];
  if (Array.isArray(v)) return v as [number, number, number];
  throw new Error(`Parámetro ${k} sin [nominal, mín, máx]`);
};
const FUENTE_CP = 'Filosofía de control rev005 – filtros.parametros';

function filoParam(k: string, label: string, unit: string, nota?: string): ParamDef {
  const [nominal, min, max] = tri(k);
  return { key: k, label, unit, nominal, min, max, group: 'Filosofía – secuencia de filtros', estado: 'DOC', fuente: FUENTE_CP, nota };
}

const capFuera = proceso.control_bypass.capacidad_segun_filtros_fuera;

export const PARAM_DEFS: ParamDef[] = [
  // ---------------- Filosofía (documentado) ----------------
  filoParam('T03_servicio_desde_ultimo_lavado_min', 'T03 – servicio desde último lavado', 'min'),
  filoParam('K03_servicio_desde_ultima_regen_min', 'K03 – servicio desde última regeneración', 'min'),
  filoParam('T06_s', 'T06 – drenaje (timer de falla)', 's'),
  { key: 'K06_mm', label: 'K06 – nivel fin de drenaje', unit: 'mm', nominal: fp.K06_mm as number, min: 0, max: 4938, group: 'Filosofía – secuencia de filtros', estado: 'A_CONFIRMAR', fuente: FUENTE_CP, nota: 'Referido al fondo del filtro (ver "Cero del LIT"). Con referencia LIT el paso 6 terminaría al instante.' },
  filoParam('T07_s', 'T07 – air scour', 's'),
  filoParam('T08_s', 'T08 – dwell (asentamiento)', 's'),
  filoParam('T09_s', 'T09 – rellenado (timer de falla)', 's'),
  { key: 'K09_mm', label: 'K09 – nivel fin de rellenado', unit: 'mm', nominal: fp.K09_mm as number, min: 0, max: 4938, group: 'Filosofía – secuencia de filtros', estado: 'A_CONFIRMAR', fuente: FUENTE_CP, nota: '3000 mm excede el rango del LIT (0–2980): se interpreta referido al fondo del filtro.' },
  filoParam('T10_s', 'T10 – retrolavado', 's'),
  filoParam('T11_s', 'T11 – sedimentación', 's'),
  filoParam('T12_s', 'T12 – recirculación', 's'),
  filoParam('T13_s', 'T13 – regeneración', 's', 'SOE dice 1800 s; se usa filosofía rev005'),
  filoParam('T14_s', 'T14 – remojo', 's', 'SOE dice 60 s; se usa filosofía rev005'),
  filoParam('T15_s', 'T15 – enjuague rápido (mínimo, luego Step Advance)', 's'),
  filoParam('T16_s', 'T16 – secuencia completa', 's'),
  { key: 'espera_valvulas_s', label: 'Espera entre cierre/apertura de válvulas (pasos 10, 11, 14)', unit: 's', nominal: 10, min: 0, max: 60, group: 'Filosofía – secuencia de filtros', estado: 'DOC', fuente: 'Filosofía rev005 pasos 10/11/14 ("espera 10 s")' },
  { key: 'lavado_por_LAH', label: 'Pedir lavado con LAH (1613 mm) en lugar de LAHH (1763 mm)', unit: '', nominal: 0, min: 0, max: 1, bool: true, group: 'Filosofía – secuencia de filtros', estado: 'A_CONFIRMAR', fuente: 'C&E rev002 filas 10–13', nota: 'La C&E describe "Level High-High" pero imprime LAH; la filosofía rev005 usa LAHH.' },
  { key: 'K12_pct', label: 'K12 – nivel sumidero regeneración para recircular', unit: '%', nominal: 30, min: 0, max: 100, group: 'Filosofía – secuencia de filtros', estado: 'A_CONFIRMAR', nota: 'Setpoint K12 no figura en los documentos (FALTANTES).' },
  { key: 'z0_LIT_mm', label: 'Cero del LIT de filtro sobre el fondo', unit: 'mm', nominal: 1830, min: 0, max: 2500, group: 'Filosofía – secuencia de filtros', estado: 'A_CONFIRMAR', nota: 'Por defecto en el tope del medio (305 + 915 + 610 = 1830 mm), así LAL/LALL (280/140 mm LIT) protegen el medio. K06/K09 se leen referidos al fondo: K06 1825 → LIT ≈ −5 mm (drenaje hasta el tope del medio) y K09 3000 → LIT 1170 mm (nivel normal).' },
  { key: 'inhibir_alarmas_nivel_lavado', label: 'Inhibir alarmas de nivel de filtro durante lavado (pasos 5–16)', unit: '', nominal: 1, min: 0, max: 1, bool: true, group: 'Filosofía – secuencia de filtros', estado: 'SUPUESTO', nota: 'Sin inhibición, el retrolavado y el drenaje disparan HH/LL en cada lavado.' },
  { key: 'nivel_reapertura_SEVO_mm', label: 'Nivel de reapertura de SEVO (condición anormal)', unit: 'mm', nominal: 1100, min: 300, max: 1600, group: 'Filosofía – secuencia de filtros', estado: 'SUPUESTO', nota: 'La filosofía dice "reabren al recuperar nivel normal" (normal 1100–1500 mm).' },

  // ---------------- Bypass ----------------
  { key: 'bypass_umbral_auto_m3h', label: 'Entrada TK para pasar FIC-603 a Auto', unit: 'm³/h', nominal: 2032, min: 0, max: 3000, group: 'Bypass FIC/FY-160305603', estado: 'DOC', fuente: 'Filosofía rev005 3.1.4' },
  { key: 'bypass_auto_si_sp', label: 'Pasar FIC-603 a Auto cuando SP de FY > 0 (además del umbral)', unit: '', nominal: 0, min: 0, max: 1, bool: true, group: 'Bypass FIC/FY-160305603', estado: 'A_CONFIRMAR', nota: 'La tabla de escenarios muestra bypass 853 m³/h con entrada 1219 m³/h (2 fuera + 1 en lavado), pero el texto dice FV al 0 % con entrada < 2032. Activar para la interpretación por SP.' },
  { key: 'cap_0_fuera', label: 'Capacidad de filtros con 0 fuera de servicio', unit: 'm³/h', nominal: capFuera['0'], min: 0, max: 2400, group: 'Bypass FIC/FY-160305603', estado: 'DOC', fuente: 'Filosofía rev005 3.1.4' },
  { key: 'cap_1_fuera', label: 'Capacidad de filtros con 1 fuera de servicio', unit: 'm³/h', nominal: capFuera['1'], min: 0, max: 2400, group: 'Bypass FIC/FY-160305603', estado: 'DOC', fuente: 'Filosofía rev005 3.1.4' },
  { key: 'cap_2_fuera', label: 'Capacidad de filtros con 2 fuera de servicio', unit: 'm³/h', nominal: capFuera['2'], min: 0, max: 2400, group: 'Bypass FIC/FY-160305603', estado: 'DOC', fuente: 'Filosofía rev005 3.1.4' },
  { key: 'pid_Kc', label: 'FIC-603 ganancia Kc', unit: '%/%', nominal: 0.6, min: 0.05, max: 5, step: 0.05, group: 'Bypass FIC/FY-160305603', estado: 'SUPUESTO' },
  { key: 'pid_Ti', label: 'FIC-603 tiempo integral Ti', unit: 's', nominal: 12, min: 1, max: 300, group: 'Bypass FIC/FY-160305603', estado: 'SUPUESTO' },
  { key: 'pid_Td', label: 'FIC-603 tiempo derivativo Td', unit: 's', nominal: 0, min: 0, max: 30, group: 'Bypass FIC/FY-160305603', estado: 'SUPUESTO' },
  { key: 'fv_tau_s', label: 'FV-603 constante de tiempo del actuador', unit: 's', nominal: 3, min: 0.5, max: 30, group: 'Bypass FIC/FY-160305603', estado: 'SUPUESTO' },

  // ---------------- Entrada / escenario ----------------
  { key: 'q_RO_m3h', label: 'FIC-160305065 – permeado RO (por otros)', unit: 'm³/h', nominal: 1030, min: 0, max: 2000, group: 'Escenario de entrada', estado: 'SUPUESTO', nota: 'Fijado por el operador. Total por defecto 1472 m³/h (promedio anual).' },
  { key: 'q_HDS_m3h', label: 'FIC-160304333 – agua tratada HDS (por otros)', unit: 'm³/h', nominal: 442, min: 0, max: 1500, group: 'Escenario de entrada', estado: 'SUPUESTO' },
  { key: 'T_agua_C', label: 'Temperatura del agua', unit: '°C', nominal: 12, min: 7, max: 20, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada (diseño 12)' },
  { key: 'pH_in', label: 'pH de entrada (mezcla, antes de ajuste)', unit: 'pH', nominal: 7.0, min: 6.5, max: 8.0, step: 0.05, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada (6.5–8.0, diseño 7)' },
  { key: 'alc_in', label: 'Alcalinidad de entrada', unit: 'mg/L CaCO₃', nominal: 50, min: 5, max: 300, group: 'Calidad de agua de entrada', estado: 'SUPUESTO', nota: 'No figura en los documentos; define la respuesta del pH a la dosificación.' },
  { key: 'cond_in', label: 'Conductividad de entrada', unit: 'µS/cm', nominal: 1200, min: 750, max: 1650, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada (750–1650)' },
  { key: 'turb_in', label: 'Turbidez de entrada', unit: 'NTU', nominal: 5, min: 1, max: 10, step: 0.5, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada (1–10, diseño 5)' },
  { key: 'fe_in', label: 'Hierro total de entrada', unit: 'mg/L', nominal: 0.02, min: 0, max: 1, step: 0.01, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada' },
  { key: 'mn_in', label: 'Manganeso de entrada', unit: 'mg/L', nominal: 0.05, min: 0.007, max: 0.5, step: 0.005, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada (0.007–0.09)' },
  { key: 'so4_in', label: 'Sulfato de entrada', unit: 'mg/L', nominal: 450, min: 0, max: 1500, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada' },
  { key: 'sio2_in', label: 'Sílice de entrada', unit: 'mg/L', nominal: 35, min: 0, max: 100, group: 'Calidad de agua de entrada', estado: 'DOC', fuente: 'calidad_agua_entrada' },
  { key: 'cond_RO', label: 'Conductividad del permeado RO (por otros)', unit: 'µS/cm', nominal: 30, min: 1, max: 300, group: 'Calidad de agua de entrada', estado: 'SUPUESTO', nota: 'La calidad documentada es la de la mezcla en TK-30015. La del agua HDS sale por diferencia, de modo que con los caudales de diseño (1030 + 442 m³/h) la mezcla da los valores documentados.' },
  { key: 'turb_RO', label: 'Turbidez del permeado RO', unit: 'NTU', nominal: 0.1, min: 0, max: 1, step: 0.05, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'pH_RO', label: 'pH del permeado RO', unit: 'pH', nominal: 6, min: 5, max: 7.5, step: 0.1, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'alc_RO', label: 'Alcalinidad del permeado RO', unit: 'mg/L CaCO₃', nominal: 5, min: 0, max: 50, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'fe_RO', label: 'Hierro total del permeado RO', unit: 'mg/L', nominal: 0.005, min: 0, max: 0.1, step: 0.001, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'mn_RO', label: 'Manganeso del permeado RO', unit: 'mg/L', nominal: 0.001, min: 0, max: 0.05, step: 0.001, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'so4_RO', label: 'Sulfato del permeado RO', unit: 'mg/L', nominal: 5, min: 0, max: 100, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'sio2_RO', label: 'Sílice del permeado RO', unit: 'mg/L', nominal: 1, min: 0, max: 20, group: 'Calidad de agua de entrada', estado: 'SUPUESTO' },
  { key: 'q_HDS_TK16_m3h', label: 'Agua HDS directa a TK-30016 (por otros)', unit: 'm³/h', nominal: 0, min: 0, max: 1500, group: 'Escenario de entrada', estado: 'SUPUESTO' },
  { key: 'T_amb_C', label: 'Temperatura ambiente', unit: '°C', nominal: 8, min: -9.4, max: 26.3, group: 'Escenario de entrada', estado: 'DOC', fuente: 'condiciones_sitio' },

  // ---------------- Química por otros ----------------
  { key: 'pH_SP_TK15', label: 'SP de pH TK-30015 (dosificación por otros)', unit: 'pH', nominal: 6.5, min: 6.0, max: 7.5, step: 0.05, group: 'Dosificación química (por otros)', estado: 'SUPUESTO', nota: 'Punto normal de AIT-160305600 según alarm list.' },
  { key: 'acido_conc_pct', label: 'Concentración H₂SO₄', unit: '% p/p', nominal: 98, min: 10, max: 98, group: 'Dosificación química (por otros)', estado: 'SUPUESTO' },
  { key: 'acido_max_Lh', label: 'Caudal máximo bomba de ácido', unit: 'L/h', nominal: 60, min: 1, max: 500, group: 'Dosificación química (por otros)', estado: 'SUPUESTO' },
  { key: 'soda_conc_pct', label: 'Concentración NaOH', unit: '% p/p', nominal: 50, min: 10, max: 50, group: 'Dosificación química (por otros)', estado: 'SUPUESTO' },
  { key: 'soda_max_Lh', label: 'Caudal máximo bomba de soda', unit: 'L/h', nominal: 60, min: 1, max: 500, group: 'Dosificación química (por otros)', estado: 'SUPUESTO' },
  { key: 'naptc_Lh', label: 'Dosificación NaPTC (PK-30011)', unit: 'L/h', nominal: 5, min: 0, max: 50, group: 'Dosificación química (por otros)', estado: 'SUPUESTO', nota: 'Solo se contabiliza; sin efecto químico modelado.' },
  { key: 'naocl_Lh', label: 'Dosificación NaOCl 12.5 % en regeneración', unit: 'L/h', nominal: 783, min: 0, max: 1500, group: 'Dosificación química (por otros)', estado: 'DOC', fuente: 'equipos.json FL-30035 caudales' },
  { key: 'pH_SP_TK16', label: 'SP de pH TK-30016 (H₂SO₄ por otros)', unit: 'pH', nominal: 6.8, min: 6.0, max: 8.0, step: 0.05, group: 'Dosificación química (por otros)', estado: 'SUPUESTO' },

  // ---------------- Hidráulica (modelo) ----------------
  { key: 'tk15_vertedero_mm', label: 'TK-30015 cresta de la caja de salida (vertedero)', unit: 'mm', nominal: 5000, min: 3000, max: 6000, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Nivel normal 5536 mm con 1771 m³/h a filtros.' },
  { key: 'tk15_rebalse_mm', label: 'TK-30015 nivel de rebalse N11', unit: 'mm', nominal: 6250, min: 5800, max: 6500, group: 'Modelo hidráulico', estado: 'SUPUESTO' },
  { key: 'z_salida_filtrada_mm', label: 'Cota efectiva de la salida de agua filtrada (SEVO) sobre el fondo', unit: 'mm', nominal: 1430, min: 0, max: 3000, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Filtro de nivel creciente: el nivel sube sobre esta cota con la pérdida de carga del lecho. Debe quedar por debajo de K06 (1825 mm) para que el drenaje del paso 6 (por SEVO) termine dentro de T06; la lógica de condición anormal (cierre de SEVO con nivel bajo) protege el medio.' },
  { key: 'R_linea_RW', label: 'Resistencia de la línea RO/RW hasta el sumidero (cota ≈ fondo)', unit: 'mm/(m³/h)', nominal: 3.2, min: 0.5, max: 20, step: 0.1, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Con el lecho limpio da ≈ 443 m³/h de enjuague a nivel normal (LIT ≈ 1100 mm).' },
  { key: 'R_limpio', label: 'Resistencia de lecho limpio', unit: 'mm/(m³/h)', nominal: 3.39, min: 0.5, max: 6, step: 0.1, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Con la salida a 1430 mm y el cero del LIT en 1830 mm: LIT ≈ 1100 mm a 443 m³/h y ≈ 1600 mm a 590 m³/h con lecho limpio (normal 1100–1500, LAH 1613).' },
  { key: 'alfa_colmatacion', label: 'Coeficiente de colmatación', unit: '1/kg', nominal: 0.005, min: 0.0005, max: 0.05, step: 0.0005, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'LAHH a ~26 h con 443 m³/h y 5 NTU (T03 actúa antes); a 590 m³/h los filtros sucios superan LAH/LAHH.' },
  { key: 'q_drenaje_bypass_m3h', label: 'Caudal de cada drenaje de ½″ de la línea de bypass (VBA-309705/707)', unit: 'm³/h', nominal: 8, min: 0, max: 30, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Válvula de bola de ½″ abierta con la carga de TK-30015 (≈ 6 m de columna).' },
  { key: 'bwo_vertedero_mm', label: 'Elevación del vertedero de retrolavado (BWO) sobre el fondo', unit: 'mm', nominal: 4200, min: 3000, max: 4938, group: 'Modelo hidráulico', estado: 'SUPUESTO' },
  { key: 'carrera_s_por_pulg', label: 'Tiempo de carrera de válvulas on/off por pulgada de diámetro', unit: 's/in', nominal: 1, min: 0.3, max: 3, step: 0.1, group: 'Modelo hidráulico', estado: 'A_CONFIRMAR', fuente: 'Spec del cliente (RA Valves): velocidad de actuadores 1 in/s × DN', nota: 'Carrera ≈ DN en segundos: válvulas de filtro de 6–24″ → 6–24 s; HV-639/646 (2″) → 2 s. Sin valor medido en sitio.' },
  { key: 'margen_discrepancia_s', label: 'Margen de la alarma de discrepancia ZAO/ZAC sobre la carrera', unit: 's', nominal: 5, min: 0, max: 30, group: 'Modelo hidráulico', estado: 'SUPUESTO', nota: 'Retardo efectivo = máx(retardo de la alarm list, carrera + margen). La alarm list da 15 s (10 s para HV-639): con carreras mayores cada maniobra daba ZAO/ZAC falsas.' },
  { key: 'q_bw_m3h', label: 'Caudal bombas de retrolavado (ideal)', unit: 'm³/h', nominal: 1562, min: 500, max: 2500, group: 'Modelo hidráulico', estado: 'DOC', fuente: 'Filosofía rev005' },
  { key: 'q_regen_m3h', label: 'Caudal bombas de regeneración (ideal)', unit: 'm³/h', nominal: 137, min: 50, max: 300, group: 'Modelo hidráulico', estado: 'DOC', fuente: 'Filosofía rev005' },
  { key: 'sump_regen_m3', label: 'Volumen sumidero de regeneración TK-30038', unit: 'm³', nominal: 120, min: 20, max: 500, group: 'Modelo hidráulico', estado: 'SUPUESTO' },
  { key: 'tk39_m3', label: 'Volumen tanque desecho retrolavado TK-30039', unit: 'm³', nominal: 450, min: 100, max: 2000, group: 'Modelo hidráulico', estado: 'SUPUESTO' },
  { key: 'tk16_SP_mm', label: 'SP de nivel TK-30016 (bombas de liberación por otros)', unit: 'mm', nominal: 7000, min: 4500, max: 10000, group: 'Modelo hidráulico', estado: 'SUPUESTO' },

  // ---------------- Calidad / medios ----------------
  { key: 'cap_greensand_kg', label: 'Capacidad oxidativa del greensand por filtro', unit: 'kg Mn', nominal: 4, min: 0.5, max: 50, step: 0.5, group: 'Modelo de calidad', estado: 'SUPUESTO' },
  { key: 'k_tss_ntu', label: 'Relación SST/turbidez', unit: '(mg/L)/NTU', nominal: 1.5, min: 0.5, max: 3, step: 0.1, group: 'Modelo de calidad', estado: 'SUPUESTO' },
  { key: 'demanda_cl_s', label: 'Demanda de cloro del lecho', unit: '1/s', nominal: 0.004, min: 0, max: 0.05, step: 0.0005, group: 'Modelo de calidad', estado: 'SUPUESTO' },

  // ---------------- Equipos ----------------
  { key: 'q_compresor_Nm3h', label: 'Caudal entregado por compresor (MK5)', unit: 'Nm³/h', nominal: 350, min: 0, max: 414, group: 'Equipos rotativos', estado: 'A_CONFIRMAR', fuente: 'equipos.json: requerido 350, capacidad 414', nota: 'Alarm list indica normal 523 Nm³/h, incoherente con HH 385.' },
  { key: 'comp_eta', label: 'Rendimiento isentrópico efectivo del compresor (temperatura de descarga)', unit: '', nominal: 0.92, min: 0.5, max: 1, step: 0.01, group: 'Equipos rotativos', estado: 'SUPUESTO', nota: 'Calibrado para que TT-160305703 dé 86–131 °C (hoja de datos) entre los extremos de temperatura ambiente del sitio (−9.4 a 26.3 °C) a la presión de descarga de diseño (≈ 102 kPa).' },
  { key: 'comp_descarga_kPa', label: 'Presión de descarga para descarga (unload) MK5', unit: 'kPa', nominal: 180, min: 105, max: 225, group: 'Equipos rotativos', estado: 'SUPUESTO', nota: 'ZE 2-37-A-2.25: máx. 2.25 bar; por debajo del tarado de PSV (2 barg datasheet).' },
  { key: 'comp_psv_kPag', label: 'Tarado PSV-160305642/643', unit: 'kPag', nominal: 200, min: 100, max: 450, group: 'Equipos rotativos', estado: 'A_CONFIRMAR', nota: '123 kPag (índice) / 2 barg (datasheet) / 0.45 MPa (P&ID vendor)' },
  { key: 'comp_vacio_min', label: 'MK5: parada tras marcha en vacío', unit: 'min', nominal: 10, min: 1, max: 60, group: 'Equipos rotativos', estado: 'DOC', fuente: 'equipos.json (ajustable 1–60 min)' },
  { key: 'psv_soplante_kPag', label: 'Tarado PSV soplantes', unit: 'kPag', nominal: 64, min: 40, max: 80, group: 'Equipos rotativos', estado: 'DOC', fuente: 'instrumentos.json PSV-160305618/622' },
  { key: 'pulso_cmd_s', label: 'Duración pulso START/STOP', unit: 's', nominal: 1, min: 0.5, max: 5, step: 0.5, group: 'Equipos rotativos', estado: 'SUPUESTO' },

  // ---------------- Eléctrico ----------------
  { key: 'costo_kWh', label: 'Costo de energía', unit: 'USD/kWh', nominal: 0.1, min: 0, max: 1, step: 0.01, group: 'Eléctrico', estado: 'SUPUESTO' },
  { key: 'v_bus_460', label: 'Tensión real barra 460 V', unit: 'V', nominal: 460, min: 380, max: 500, group: 'Eléctrico', estado: 'DOC', fuente: 'electrico.json' },

  // ---------------- Instrumentación ----------------
  { key: 'ruido', label: 'Ruido de medición', unit: '', nominal: 1, min: 0, max: 1, bool: true, group: 'Instrumentación', estado: 'SUPUESTO' },
  { key: 'aire_inst_kPag', label: 'Presión de suministro aire de instrumentos', unit: 'kPag', nominal: 690, min: 0, max: 900, group: 'Instrumentación', estado: 'DOC', fuente: 'electrico.json aire_instrumentos (100 psig; mín 550)' },
  { key: 'ait442_max', label: 'Rango AIT-160305442 (máx)', unit: 'µS/cm', nominal: 3000, min: 1000, max: 10000, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Rango no documentado' },
  { key: 'ait442_H', label: 'AAH-160305442', unit: 'µS/cm', nominal: 1650, min: 500, max: 5000, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'ait442_HH', label: 'AAHH-160305442 (disparo E1/E2)', unit: 'µS/cm', nominal: 1800, min: 500, max: 5000, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'ait288_HH', label: 'AAHH-160305288 pH TK-30016', unit: 'pH', nominal: 8.0, min: 6, max: 10, step: 0.1, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel" (alarm list línea 9)' },
  { key: 'ait288_H', label: 'AAH-160305288 pH TK-30016', unit: 'pH', nominal: 7.5, min: 6, max: 10, step: 0.1, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'ait288_L', label: 'AAL-160305288 pH TK-30016', unit: 'pH', nominal: 6.2, min: 4, max: 8, step: 0.1, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'ait288_LL', label: 'AALL-160305288 pH TK-30016', unit: 'pH', nominal: 5.8, min: 4, max: 8, step: 0.1, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'lit276_LL', label: 'LALL-160305276 TK-30016 (disparo bombas retrolavado)', unit: 'mm', nominal: 3000, min: 0, max: 11500, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Setpoint "por Bechtel"' },
  { key: 'lit276_L', label: 'LAL-160305276 TK-30016 (disparo AG-30007)', unit: 'mm', nominal: 4064, min: 0, max: 11500, group: 'Instrumentación', estado: 'A_CONFIRMAR', nota: 'Datasheet agitador: no operar < 4064 mm' },
  { key: 'lit276_H', label: 'LAH-160305276 TK-30016', unit: 'mm', nominal: 9500, min: 0, max: 11500, group: 'Instrumentación', estado: 'A_CONFIRMAR' },
  { key: 'lit276_HH', label: 'LAHH-160305276 TK-30016', unit: 'mm', nominal: 10500, min: 0, max: 11500, group: 'Instrumentación', estado: 'A_CONFIRMAR' },
];

export type Params = Record<string, number>;

export function defaultParams(): Params {
  const p: Params = {};
  for (const d of PARAM_DEFS) p[d.key] = d.nominal;
  return p;
}

export const paramDef = (key: string) => PARAM_DEFS.find((d) => d.key === key);

/** Rango (EU) usado para escalar AIs; AIT-442 no tiene rango documentado. */
export function rangoAI(tag: string, p: Params): [number, number] {
  if (tag === 'AIT-160305442') return [0, p.ait442_max];
  return rangoInstrumento(tag) ?? [0, 100];
}
