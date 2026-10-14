// Química del agua: sistema carbonato para pH, mezcla de corrientes y dosificación.
// Unidades internas: alcalinidad en meq/L (= eq/m³), carbono inorgánico total CT en mmol/L.

export interface Calidad {
  /** Alcalinidad total, meq/L */
  alk: number;
  /** Carbono inorgánico total, mmol/L */
  ct: number;
  /** Conductividad, µS/cm */
  cond: number;
  /** Turbidez, NTU */
  turb: number;
  /** Hierro total, mg/L */
  fe: number;
  /** Manganeso, mg/L */
  mn: number;
  /** Cloro libre, mg/L */
  cl: number;
  /** Sulfato, mg/L */
  so4: number;
  /** Sílice, mg/L */
  sio2: number;
}

export const ESPECIES: (keyof Calidad)[] = ['alk', 'ct', 'cond', 'turb', 'fe', 'mn', 'cl', 'so4', 'sio2'];

export const calidadVacia = (): Calidad => ({ alk: 0, ct: 0, cond: 0, turb: 0, fe: 0, mn: 0, cl: 0, so4: 0, sio2: 0 });
export const copiaCalidad = (c: Calidad): Calidad => ({ ...c });

/** Constantes de equilibrio (agua dulce, sin corrección de actividad). */
export function constantes(TC: number) {
  const T = TC + 273.15;
  const pK1 = 3404.71 / T + 0.032786 * T - 14.8435;
  const pK2 = 2902.39 / T + 0.02379 * T - 6.498;
  const pKw = 4470.99 / T - 6.0875 + 0.01706 * T;
  // Solubilidad de CO2 (Weiss 1974), mol/(L·atm)
  const KH = Math.exp(-58.0931 + 90.5069 * (100 / T) + 22.294 * Math.log(T / 100));
  return { K1: 10 ** -pK1, K2: 10 ** -pK2, Kw: 10 ** -pKw, KH };
}

function fracciones(H: number, K1: number, K2: number) {
  const d = H * H + K1 * H + K1 * K2;
  return { a0: (H * H) / d, a1: (K1 * H) / d, a2: (K1 * K2) / d };
}

/** CT (mmol/L) a partir de pH y alcalinidad (meq/L). */
export function ctDesdePh(pH: number, alk: number, TC: number): number {
  const { K1, K2, Kw } = constantes(TC);
  const H = 10 ** -pH;
  const { a1, a2 } = fracciones(H, K1, K2);
  const alkEq = alk / 1000;
  const ct = (alkEq - Kw / H + H) / (a1 + 2 * a2);
  return Math.max(ct * 1000, 1e-6);
}

/** pH a partir de alcalinidad (meq/L) y CT (mmol/L), por bisección. */
export function phDesde(alk: number, ct: number, TC: number): number {
  const { K1, K2, Kw } = constantes(TC);
  const A = alk / 1000;
  const C = Math.max(ct, 0) / 1000;
  let lo = 1;
  let hi = 13.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const H = 10 ** -mid;
    const { a1, a2 } = fracciones(H, K1, K2);
    const f = C * (a1 + 2 * a2) + Kw / H - H - A;
    if (f > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** CO2 disuelto (mmol/L) y su saturación a la presión atmosférica del sitio. */
export function co2(alk: number, ct: number, TC: number, pAtmBar: number) {
  const pH = phDesde(alk, ct, TC);
  const { K1, K2, KH } = constantes(TC);
  const { a0 } = fracciones(10 ** -pH, K1, K2);
  const sat = KH * (pAtmBar / 1.01325) * 420e-6 * 1000;
  return { co2: ct * a0, sat };
}

/** eq/L de un producto comercial. */
export const eqPorLitroAcido = (pct: number) => ((1 + 0.0084 * pct) * pct * 10 * 2) / 98.08;
export const eqPorLitroSoda = (pct: number) => ((1 + 0.0105 * pct) * pct * 10) / 40.0;
/** Cloro disponible en NaOCl comercial 12.5 % (p/v), kg Cl2 por litro */
export const CL2_KG_POR_L_NAOCL = 0.125;

/** Mezcla ponderada por caudal. */
export function mezclar(corrientes: { q: number; c: Calidad }[]): Calidad {
  const out = calidadVacia();
  let qt = 0;
  for (const { q, c } of corrientes) {
    if (q <= 0) continue;
    qt += q;
    for (const k of ESPECIES) out[k] += q * c[k];
  }
  if (qt <= 0) return corrientes.length ? copiaCalidad(corrientes[0].c) : out;
  for (const k of ESPECIES) out[k] /= qt;
  return out;
}

/**
 * Paso de tanque agitado (CSTR) con volumen variable.
 * c: concentración actual; V: volumen (m³) tras el paso; entradas en m³/h; fuentes en (unidad·m³)/h.
 */
export function pasoCSTR(
  c: Calidad,
  V: number,
  entradas: { q: number; c: Calidad }[],
  dtS: number,
  fuentes?: Partial<Record<keyof Calidad, number>>,
): Calidad {
  const Vef = Math.max(V, 0.5);
  const h = dtS / 3600;
  const out = copiaCalidad(c);
  for (const k of ESPECIES) {
    let d = 0;
    for (const e of entradas) if (e.q > 0) d += e.q * (e.c[k] - c[k]);
    d += fuentes?.[k] ?? 0;
    out[k] = Math.max(0, c[k] + (d * h) / Vef);
  }
  return out;
}

/** Turbidez (NTU) → sólidos suspendidos (mg/L) */
export const sst = (c: Calidad, kTss: number) => c.turb * kTss + c.fe * 1.91 + c.mn * 1.58;

/** ORP estimado (mV, Ag/AgCl) a partir del cloro libre y pH — solo indicativo. */
export function orpEstimado(clMgL: number, pH: number): number {
  if (clMgL < 0.01) return 250 + 20 * (7 - pH);
  return Math.min(900, 550 + 120 * Math.log10(clMgL / 0.1 + 1) + 25 * (7 - pH));
}
