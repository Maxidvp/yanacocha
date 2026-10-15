// Modelo de proceso de la planta (lado campo). Integra a paso fijo; lee salidas del PLC desde la
// tabla de I/O y escribe las entradas (AI en mA, DI de finales de carrera y de motores).
import { filtrosEquipo, valvulas, electrico, proceso, LETRA_FILTRO, FUNCIONES_VALVULA, type FuncionValvula } from '../../data';
import { PARAM_DEFS, type Params } from '../params';
import type { TablaIO } from '../io/iotable';
import { Motor, ValvulaControl, ValvulaOnOff, type FallaFinCarrera } from './devices';
import {
  calidadVacia, copiaCalidad, ctDesdePh, co2, eqPorLitroAcido, eqPorLitroSoda, mezclar, pasoCSTR, phDesde, sst,
  CL2_KG_POR_L_NAOCL, type Calidad,
} from './water';

export type ModoFallaTx = 'ok' | 'congelado' | 'bajo' | 'alto' | 'abierto' | 'deriva';
export interface FallaTransmisor {
  modo: ModoFallaTx;
  /** deriva en unidades de ingeniería por hora */
  deriva?: number;
  acumulado?: number;
  mAcongelado?: number;
}

export interface Fallas {
  aireInstrumentos: boolean;
  /** 120 VAC UPS del cliente → solo alimenta 16045-PK-30005JB */
  ups120: boolean;
  /** 24 VDC del tablero 16045-PK-30005JB → solo alimenta FIT-160305603 (MCB-201) */
  dc24: boolean;
  /** 24 VDC del panel de I/O del cliente → solenoides, finales de carrera (vía VJB) y lazos LIT de filtros */
  dc24Cliente: boolean;
  bombaRetrolavado: boolean;
  bombaRegeneracion: boolean;
  bombaNaOCl: boolean;
  correaRota: Record<string, boolean>;
  filtroAireTapado: Record<string, boolean>;
  transmisor: Record<string, FallaTransmisor>;
}

export const fallasVacias = (): Fallas => ({
  aireInstrumentos: false, ups120: false, dc24: false, dc24Cliente: false, bombaRetrolavado: false, bombaRegeneracion: false,
  bombaNaOCl: false, correaRota: {}, filtroAireTapado: {}, transmisor: {},
});

// ---------------- Constantes geométricas (de los JSON) ----------------
const TK15 = { D: 4.3, H: 6.5 };
const A_TK15 = (Math.PI * TK15.D ** 2) / 4;
const A_TK16 = (Math.PI * 6.75 ** 2) / 4;
const H_TK16 = 11500;
const L_NORMAL_TK15 = 5536;
const ALTO_FILTRO_MM = filtrosEquipo[0].dimensiones.alto_m * 1000;
const A_FILTRO = filtrosEquipo[0].area_filtracion_m2;
const ESPESOR_MEDIO_MM = filtrosEquipo[0].medios.reduce((s, m) => s + m.espesor_m, 0) * 1000;
const Q_DISENO_FILTROS = 1771;
const Q_AIRE_SOPLANTE = filtrosEquipo[0].caudales.aire_scour_Nm3h;
const DP_SOPLANTE = 58.3;
const P_ATM_KPA = proceso.condiciones_sitio.p_atm_bar_abs * 100;
const Q_FV_MAX = 853; // tope mecánico (valvulas.json)
const MOTORES_LCS = new Set(electrico.estaciones_locales.equipos.map((t) => t.replace(/-M-HS$/, '')));

/** Coeficientes derivados de los puntos de diseño. */
const CW_TK15 = (vert: number) => Q_DISENO_FILTROS / ((L_NORMAL_TK15 - vert) / 1000) ** 1.5;
const C_AIRE = Q_AIRE_SOPLANTE / Math.sqrt(DP_SOPLANTE - ((1825 - 300) / 1000) * 9.81);

export type EstadoMK5 = 'PARADO' | 'ARRANCANDO' | 'CARGA' | 'VACIO';

export class Compresor {
  estado: EstadoMK5 = 'PARADO';
  tEstado = 0;
  tVacio = 0;
  q = 0; // Nm³/h entregado
  pDescarga = 0; // kPag
  tDescarga: number;
  tAceite: number;
  tRodLA: number;
  tRodLOA: number;
  pAceite = 0;
  dpFiltro = 1.6;
  paradaVendor = false;
  constructor(readonly motor: Motor, readonly valvulaManual: string, tAmb: number) {
    this.tDescarga = tAmb;
    this.tAceite = tAmb;
    this.tRodLA = tAmb;
    this.tRodLOA = tAmb;
  }
}

export class Soplante {
  q = 0;
  pDescarga = 0;
  tDescarga: number;
  kW = 0;
  /** caudal aliviado por la PSV propia (descarga bloqueada), Nm³/h */
  qPSV = 0;
  /** retención VCH abierta (pasa caudal al colector) */
  retencionAbierta = false;
  /** lectura del manómetro local (con aislamiento y venteo), kPag */
  piLectura = 0;
  /** válvulas manuales del tren de descarga (valvulas.json → equipo) */
  vDescarga: string | null = null;
  vRetencion: string | null = null;
  vAislPI: string | null = null;
  vDrenPI: string | null = null;
  constructor(readonly motor: Motor, readonly psv: string, readonly pi: string, tAmb: number) {
    this.tDescarga = tAmb;
  }
}

export class FiltroFisico {
  /** nivel de agua sobre el fondo, mm */
  h: number;
  /** sólidos retenidos, kg */
  suciedad = 8;
  /** sólidos en suspensión en el agua del filtro, kg */
  susp = 0;
  /** lecho "aflojado" por air scour (0..1) */
  aflojado = 0;
  /** maduración tras retrolavado (0.75..1) */
  maduracion = 1;
  /** capacidad oxidativa remanente, kg Mn */
  capOx: number;
  /** cloro libre en el agua del filtro, mg/L */
  cl = 0;
  qSEVI = 0; qSEVO = 0; qBWI = 0; qBWO = 0; qRI = 0; qRW = 0; qRebalse = 0; qDrenaje = 0; qAire = 0;
  calidadSalida: Calidad = calidadVacia();
  turbBWO = 0;
  volFiltrado = 0;
  volRetrolavado = 0;
  ola = 0;
  readonly valvulas: Record<FuncionValvula, ValvulaOnOff>;
  constructor(readonly idx: number, readonly tag: string, readonly lit: string, vs: Record<FuncionValvula, ValvulaOnOff>, cap: number, h0: number) {
    this.valvulas = vs;
    this.capOx = cap * 0.85;
    this.h = h0;
  }
  get letra() {
    return LETRA_FILTRO[this.idx];
  }
  /** Volumen de agua en el filtro (sobre el medio + poros), m³ */
  get volAgua() {
    const sobre = Math.max(0, this.h - ESPESOR_MEDIO_MM);
    const poros = 0.45 * Math.min(this.h, ESPESOR_MEDIO_MM);
    return (A_FILTRO * (sobre + poros)) / 1000;
  }
}

/** Estado de los equipos "por otros" (fronteras simples). */
export class Frontera {
  bombaBW = false;
  bombaRegen = false;
  bombaNaOCl = false;
  qBW = 0;
  qRegen = 0;
  naoclLh = 0;
  acidoLh = 0;
  sodaLh = 0;
  acidoI = 0;
  sodaI = 0;
  acido16Lh = 0;
  acido16I = 0;
  qLiberacion = 0;
  liberacionI = 0;
  evacRegen = false;
  evacBW = false;
}

const VALVULAS_DRENAJE_MANUAL = new Set(['16045-VBF-309703', '16045-VBF-309718', '16045-VBF-309720', '16045-VBF-309722', '16045-VBF-309724', '16045-VBA-309712', '16045-VBA-309716', '16045-VBA-309705', '16045-VBA-309707', '16045-VBF-309709']);

/** PRNG determinista (mulberry32) para ruido de medición reproducible. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Planta {
  t = 0;
  // ---- tanques ----
  L15 = L_NORMAL_TK15;
  L16 = 7000;
  c15: Calidad;
  c16: Calidad;
  cEntrada: Calidad;
  /** calidad por corriente: permeado RO (supuesto) y agua tratada HDS (por diferencia con la mezcla de diseño) */
  cRO: Calidad = calidadVacia();
  cHDS: Calidad = calidadVacia();
  pH15 = 6.5;
  pH16 = 6.8;
  pH15medido = 6.5;
  // ---- caudales principales (m³/h) ----
  qRO = 0; qHDS = 0; qEntrada = 0; qAFiltros = 0; qBypass = 0; qRebalse15 = 0; qDrenaje15 = 0;
  /** estación de bypass: rama FIT/FV (VBF-309704/708), rodeo VBF-309709, drenajes VBA-309705/707, FIT-160305603 */
  qBypassFV = 0; qBypass709 = 0; qDrenajeBypass = 0; qFIT603 = 0;
  qFiltrada = 0; qSumidero = 0; qHDS16 = 0;
  /** Balance de agua de TK-30015 + filtros (m³/h): entradas − salidas = acumulación */
  balance = { entradas: 0, salidas: 0, acumulacion: 0, cierre: 0, entrada: 0, retrolavado: 0, regeneracion: 0, filtrada: 0, rw: 0, bwo: 0, bypass: 0, otras: 0, vol: 0 };
  cFiltrada: Calidad = calidadVacia();
  cSumidero: Calidad = calidadVacia();
  // ---- sumideros ----
  vRegen: number;
  clRegen = 0;
  vTK39: number;
  turbTK39 = 0;
  // ---- aire ----
  pAireInst: number;
  consumoAireInst = 0;
  pAireSoplado = 0;
  qAireSoplado = 0; // FIT-607
  qAirePSVsoplantes = 0;
  qAire639 = 0;
  qAireComp = 0; // FIT-602
  qAireTK15 = 0;
  qAire646 = 0;
  pAireComp = 0;
  // ---- equipos ----
  readonly valvulasOnOff = new Map<string, ValvulaOnOff>();
  readonly fv603 = new ValvulaControl('FV-160305603');
  readonly motores = new Map<string, Motor>();
  readonly compresores: Compresor[];
  readonly soplantes: Soplante[];
  readonly filtros: FiltroFisico[];
  readonly frontera = new Frontera();
  manuales: Record<string, boolean> = {};
  fallas: Fallas = fallasVacias();
  // ---- eléctrico ----
  kWcargas: Record<string, number> = {};
  kWtotal = 0;
  kVA460 = 0;
  I460 = 0;
  kWh = 0;
  // ---- totalizadores ----
  tot = { entrada: 0, filtrada: 0, bypass: 0, retrolavado: 0, regenRW: 0, rebalse15: 0, acidoL: 0, sodaL: 0, naoclL: 0, naptcL: 0, aireSopladoNm3: 0 };
  private rnd = prng(26443);
  private aiCongelado = new Map<string, number>();

  constructor(private p: Params) {
    const tAmb = p.T_amb_C;
    this.pAireInst = p.aire_inst_kPag;
    for (const v of valvulas) {
      if (v.funcion === 'MANUAL') {
        this.manuales[v.tag] = !VALVULAS_DRENAJE_MANUAL.has(v.tag);
        continue;
      }
      if (v.funcion === 'BYPASS_CTRL') continue;
      const filtro = v.filtro ? filtrosEquipo.findIndex((f) => f.tag === v.filtro) : null;
      this.valvulasOnOff.set(v.tag, new ValvulaOnOff(v.tag, v.funcion, filtro === -1 ? null : filtro, v.tamano_in ?? 2));
    }
    const acel: Record<string, number> = { '16045-AG-30006': 2, '16045-AG-30007': 3, '16045-BL-30008': 5, '16045-BL-30009': 5, '16045-CM-30011': 3, '16045-CM-30012': 3 };
    for (const tag of Object.keys(acel)) this.motores.set(tag, new Motor(tag, acel[tag], MOTORES_LCS.has(tag), tAmb));
    this.compresores = [
      new Compresor(this.motores.get('16045-CM-30011')!, '16045-VBF-309726', tAmb),
      new Compresor(this.motores.get('16045-CM-30012')!, '16045-VBF-309727', tAmb),
    ];
    this.soplantes = [
      new Soplante(this.motores.get('16045-BL-30008')!, 'PSV-160305618', 'PI-160305605', tAmb),
      new Soplante(this.motores.get('16045-BL-30009')!, 'PSV-160305622', 'PI-160305606', tAmb),
    ];
    // tren de descarga de cada soplante según la lista de válvulas
    for (const s of this.soplantes) {
      for (const v of valvulas) {
        if (v.funcion !== 'MANUAL') continue;
        if (v.equipo === s.motor.tag && v.tag.includes('-VCH-')) s.vRetencion = v.tag;
        else if (v.equipo === s.motor.tag && v.tag.includes('-VBF-')) s.vDescarga = v.tag;
        else if (v.descripcion === `Aislamiento ${s.pi}`) s.vAislPI = v.tag;
        else if (v.descripcion === `Drenaje ${s.pi}`) s.vDrenPI = v.tag;
      }
    }
    this.filtros = filtrosEquipo.map((f, i) => {
      const vs = {} as Record<FuncionValvula, ValvulaOnOff>;
      for (const fn of FUNCIONES_VALVULA) vs[fn] = this.valvulasOnOff.get(f.valvulas[fn])!;
      const fil = new FiltroFisico(i, f.tag, f.transmisor_nivel, vs, p.cap_greensand_kg, p.z0_LIT_mm + 1100);
      // estados iniciales escalonados para que los lavados no coincidan
      fil.suciedad = [10, 30, 50, 70][i];
      fil.capOx = p.cap_greensand_kg * [0.9, 0.75, 0.6, 0.45][i];
      return fil;
    });
    this.cEntrada = this.calidadEntrada();
    this.c15 = copiaCalidad(this.cEntrada);
    this.c15.ct = ctDesdePh(6.5, this.cEntrada.alk, p.T_agua_C);
    this.c16 = copiaCalidad(this.c15);
    this.vRegen = p.sump_regen_m3 * 0.6;
    this.vTK39 = p.tk39_m3 * 0.2;
  }

  setParams(p: Params) {
    this.p = p;
  }

  /** Inicializa TK-30015 en el SP de pH con la dosis de ácido/soda de régimen (evita transitorios al inicio). */
  inicializarQuimica() {
    const p = this.p;
    const TC = p.T_agua_C;
    const cin = this.calidadEntrada();
    let lo = -5;
    let hi = cin.alk + 5;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (phDesde(mid, cin.ct, TC) > p.pH_SP_TK15) hi = mid;
      else lo = mid;
    }
    const alkObj = (lo + hi) / 2;
    const q = p.q_RO_m3h + p.q_HDS_m3h;
    const eq = q * (cin.alk - alkObj);
    const fr = this.frontera;
    fr.acidoI = eq > 0 ? Math.min(p.acido_max_Lh, eq / eqPorLitroAcido(p.acido_conc_pct)) : 0;
    fr.sodaI = eq < 0 ? Math.min(p.soda_max_Lh, -eq / eqPorLitroSoda(p.soda_conc_pct)) : 0;
    this.c15 = { ...cin, alk: alkObj };
    this.pH15 = phDesde(this.c15.alk, this.c15.ct, TC);
    this.pH15medido = this.pH15;
    this.c16 = copiaCalidad(this.c15);
    this.c16.turb = 0.4;
    this.c16.mn = 0.005;
    this.pH16 = this.pH15;
  }

  motor(tag: string) {
    return this.motores.get(tag)!;
  }

  /** Calidad de la mezcla de diseño (documentada en proceso_y_logica.json → calidad_agua_entrada). */
  calidadMezclaDiseno(): Calidad {
    const p = this.p;
    const alk = p.alc_in / 50;
    return {
      alk, ct: ctDesdePh(p.pH_in, alk, p.T_agua_C), cond: p.cond_in, turb: p.turb_in, fe: p.fe_in, mn: p.mn_in,
      cl: 0, so4: p.so4_in, sio2: p.sio2_in,
    };
  }

  /**
   * Calidad por corriente y mezcla real según los caudales del momento. El permeado RO usa supuestos editables;
   * el agua HDS sale por diferencia para que, con los caudales nominales, la mezcla sea la documentada.
   */
  calidadEntrada(): Calidad {
    const p = this.p;
    const d = this.calidadMezclaDiseno();
    const alkRO = p.alc_RO / 50;
    this.cRO = { alk: alkRO, ct: ctDesdePh(p.pH_RO, alkRO, p.T_agua_C), cond: p.cond_RO, turb: p.turb_RO, fe: p.fe_RO, mn: p.mn_RO, cl: 0, so4: p.so4_RO, sio2: p.sio2_RO };
    const qRO = PARAM_DEFS.find((x) => x.key === 'q_RO_m3h')!.nominal;
    const qHDS = PARAM_DEFS.find((x) => x.key === 'q_HDS_m3h')!.nominal;
    const resto = (k: keyof Calidad) => Math.max(0, (d[k] * (qRO + qHDS) - this.cRO[k] * qRO) / qHDS);
    this.cHDS = { alk: resto('alk'), ct: resto('ct'), cond: resto('cond'), turb: resto('turb'), fe: resto('fe'), mn: resto('mn'), cl: 0, so4: resto('so4'), sio2: resto('sio2') };
    if (this.qRO + this.qHDS < 1) return d;
    return mezclar([{ q: this.qRO, c: this.cRO }, { q: this.qHDS, c: this.cHDS }]);
  }

  private ruido(sigma: number) {
    if (!this.p.ruido) return 0;
    // Box–Muller
    const u = Math.max(1e-9, this.rnd());
    const v = this.rnd();
    return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 24 VDC de 16045-PK-30005JB (alimenta solo FIT-160305603, electrico.json → tablero_instrumentos) */
  get alimPK30005() {
    return !this.fallas.ups120 && !this.fallas.dc24;
  }

  /** 24 VDC del panel de I/O del cliente: solenoides y finales de carrera (VJB) y lazos LIT de filtros */
  get alimIOCliente() {
    return !this.fallas.dc24Cliente;
  }

  /** Alimentación del lazo de cada AI (electrico.json → fallas_correctas). */
  private aiAlimentada(tag: string) {
    if (tag === 'FIT-160305603') return this.alimPK30005;
    if (this.filtros.some((f) => f.lit === tag)) return this.alimIOCliente;
    return true;
  }

  /** Nivel que ve el LIT del filtro (escala del LIT, mm). */
  litFiltro(f: FiltroFisico) {
    const holdup = 90 * (f.qAire / Q_AIRE_SOPLANTE);
    return f.h - this.p.z0_LIT_mm + holdup + f.ola;
  }

  // =====================================================================
  step(dt: number, io: TablaIO) {
    const p = this.p;
    this.t += dt;
    const tAmb = p.T_amb_C;
    const ioCliente = this.alimIOCliente;

    // ---------- 1. Aire de instrumentos ----------
    const objetivoAire = this.fallas.aireInstrumentos ? 0 : p.aire_inst_kPag;
    const tauAire = objetivoAire < this.pAireInst ? 40 : 8;
    this.pAireInst += ((objetivoAire - this.pAireInst) * dt) / tauAire;
    const aireOk = this.pAireInst >= 300;

    // ---------- 2. Válvulas ----------
    let consumo = 0;
    for (const v of this.valvulasOnOff.values()) {
      const sol = ioCliente && io.leerSalida(v.tag);
      consumo += v.actualizar(dt, sol, aireOk, v.diametroIn * p.carrera_s_por_pulg);
    }
    const mAfv = io.leerAOmA('FCV-160305603');
    this.fv603.actualizar(dt, mAfv, this.pAireInst, p.fv_tau_s);
    this.consumoAireInst = this.pAireInst > 50 ? 55 + 6 * this.fv603.pos + consumo : 0;

    // ---------- 3. Fronteras (por otros) ----------
    const fr = this.frontera;
    const reqBW = io.leerSalida('EXT-PU-30407-08-REQ');
    fr.bombaBW = reqBW && !this.fallas.bombaRetrolavado;
    const aperturasBWI = this.filtros.reduce((s, f) => s + f.valvulas.BWI.apertura, 0);
    const succionTK16 = this.L16 > 500;
    fr.qBW = fr.bombaBW && aperturasBWI > 0.05 && succionTK16 ? p.q_bw_m3h * Math.min(1, aperturasBWI) : 0;
    const nivelRegenPct = (100 * this.vRegen) / p.sump_regen_m3;
    fr.bombaRegen = io.leerSalida('EXT-PU-30169-70-REQ') && !this.fallas.bombaRegeneracion;
    const aperturasRI = this.filtros.reduce((s, f) => s + f.valvulas.RI.apertura, 0);
    fr.qRegen = fr.bombaRegen && aperturasRI > 0.05 && nivelRegenPct > 3 ? p.q_regen_m3h * Math.min(1, aperturasRI) : 0;
    fr.bombaNaOCl = io.leerSalida('EXT-PU-30236-37-REQ') && !this.fallas.bombaNaOCl;
    fr.naoclLh = fr.bombaNaOCl && fr.qRegen > 0 ? p.naocl_Lh : 0;

    const paroRO = io.leerSalida('EXT-E1-STOP-RO');
    const paroHDS = io.leerSalida('EXT-E2-STOP-HDS');
    this.qRO = paroRO ? 0 : p.q_RO_m3h;
    this.qHDS = paroHDS ? 0 : p.q_HDS_m3h;
    this.qEntrada = this.qRO + this.qHDS;

    // ---------- 4. TK-30015: salidas por gravedad ----------
    const headVert = Math.max(0, this.L15 - p.tk15_vertedero_mm) / 1000;
    const qVert = CW_TK15(p.tk15_vertedero_mm) * headVert ** 1.5;
    const acept = this.filtros.map((f) => f.valvulas.SEVI.apertura * 1400 * Math.min(1, Math.max(0, (ALTO_FILTRO_MM - 100 - f.h) / 300)));
    const aceptTot = acept.reduce((a, b) => a + b, 0);
    this.qAFiltros = Math.min(qVert, aceptTot);
    // estación de bypass (P&ID): VBF-309704 → VBA-309705 → FIT-160305603 → FV-160305603 → VBA-309707 → VBF-309708;
    // VBF-309709 rodea toda la estación (ese caudal no lo mide la FIT ni lo controla la FV)
    const m = this.manuales;
    const cabeza = Math.sqrt(Math.max(0, this.L15 / 1000 + 0.75) / (L_NORMAL_TK15 / 1000 + 0.75));
    this.qBypassFV = m['16045-VBF-309704'] && m['16045-VBF-309708'] ? Math.min(Q_FV_MAX, Q_FV_MAX * this.fv603.fraccionCv) * cabeza : 0;
    this.qBypass709 = m['16045-VBF-309709'] ? 1300 * cabeza : 0;
    // drenajes de ½″: con la carga del TK (VBF-309704 abierta); el de aguas abajo de la FV solo si la FV deja pasar
    const dren705 = m['16045-VBA-309705'] && m['16045-VBF-309704'] ? p.q_drenaje_bypass_m3h * cabeza : 0;
    const dren707 = m['16045-VBA-309707'] && m['16045-VBF-309704'] && this.fv603.fraccionCv > 0.001 ? p.q_drenaje_bypass_m3h * cabeza : 0;
    this.qDrenajeBypass = dren705 + dren707;
    this.qFIT603 = this.qBypassFV + dren707;
    this.qBypass = this.qBypassFV + this.qBypass709;
    this.qRebalse15 = this.L15 > p.tk15_rebalse_mm ? 20000 * ((this.L15 - p.tk15_rebalse_mm) / 1000) ** 1.5 : 0;
    this.qDrenaje15 = this.manuales['16045-VBF-309703'] ? 250 * Math.sqrt(Math.max(0, this.L15) / L_NORMAL_TK15) : 0;
    const qSalida15 = this.qAFiltros + this.qBypass + this.qRebalse15 + this.qDrenaje15 + this.qDrenajeBypass;
    this.L15 += ((this.qEntrada - qSalida15) / A_TK15) * (1000 / 3600) * dt;
    this.L15 = Math.min(TK15.H * 1000, Math.max(0, this.L15));

    // ---------- 5. Sistema de aire de soplado (air scour) ----------
    this.pasoSoplantes(dt, io, tAmb);

    // ---------- 6. Filtros ----------
    const kTss = p.k_tss_ntu;
    const sstEntrada = sst(this.c15, kTss);
    const clDosis = fr.qRegen > 0 ? (fr.naoclLh * CL2_KG_POR_L_NAOCL * 1e6) / (fr.qRegen * 1000) : 0;
    const cRI = this.clRegen + clDosis;
    let qRWtot = 0;
    let clRWmasa = 0;
    let qBWOtot = 0;
    let turbBWOmasa = 0;
    this.filtros.forEach((f, i) => {
      const v = f.valvulas;
      const R = p.R_limpio * (1 + p.alfa_colmatacion * f.suciedad);
      // SEVO descarga sobre la cota de salida de agua filtrada; RO/RW va al sumidero (≈ cota de fondo) por su línea
      f.qSEVI = aceptTot > 0 ? (this.qAFiltros * acept[i]) / aceptTot : 0;
      f.qBWI = aperturasBWI > 0 ? (fr.qBW * v.BWI.apertura) / aperturasBWI : 0;
      f.qRI = aperturasRI > 0 ? (fr.qRegen * v.RI.apertura) / aperturasRI : 0;
      f.qSEVO = (v.SEVO.apertura * Math.max(0, f.h - p.z_salida_filtrada_mm)) / R;
      f.qRW = (v.FRO.apertura * Math.max(0, f.h)) / (R + p.R_linea_RW);
      f.qBWO = v.BWO.apertura * 49400 * (Math.max(0, f.h - p.bwo_vertedero_mm) / 1000) ** 1.5;
      f.qRebalse = f.h > ALTO_FILTRO_MM ? 30000 * ((f.h - ALTO_FILTRO_MM) / 1000) ** 1.5 : 0;
      const drenaje = ['16045-VBF-309718', '16045-VBF-309720', '16045-VBF-309722', '16045-VBF-309724'][i];
      f.qDrenaje = this.manuales[drenaje] ? 60 * Math.sqrt(Math.max(0, f.h) / 3000) : 0;
      const qIn = f.qSEVI + f.qBWI + f.qRI;
      const qOut = f.qSEVO + f.qRW + f.qBWO + f.qRebalse + f.qDrenaje;
      f.h = Math.max(0, f.h + ((qIn - qOut) / A_FILTRO) * (1000 / 3600) * dt);

      // superficie: oleaje durante air scour y retrolavado (afecta la lectura del LIT)
      const agit = f.qAire > 100 ? 35 : f.qBWI > 100 ? 15 : 0;
      f.ola = 0.8 * f.ola + 0.2 * this.ruido(agit);

      // --- Colmatación y calidad (filtración descendente por SEVO o RO/RW) ---
      const qFiltra = f.qSEVO + f.qRW;
      const ratioR = R / p.R_limpio;
      const rotura = ratioR > 1.9 ? Math.min(0.5, (ratioR - 1.9) * 0.8) : 0;
      const eta = Math.max(0.2, 0.94 * f.maduracion - rotura);
      f.suciedad += (qFiltra * sstEntrada * eta * dt) / 3600 / 1000;
      if (qFiltra > 1) f.maduracion = Math.min(1, f.maduracion + (dt / 1200) * (1 - f.maduracion) * 4);
      const etaMn = 0.97 * Math.min(1, f.capOx / (0.3 * p.cap_greensand_kg));
      const mnRem = qFiltra * this.c15.mn * etaMn; // g/h
      const feRem = qFiltra * this.c15.fe * 0.95;
      f.capOx = Math.max(0, f.capOx - ((mnRem + 0.2 * feRem) * dt) / 3600 / 1000);
      f.volFiltrado += (f.qSEVO * dt) / 3600;
      f.volRetrolavado += (f.qBWI * dt) / 3600;

      // --- Air scour: afloja el lecho ---
      if (f.qAire > 100) f.aflojado = Math.min(1, f.aflojado + (dt / 120) * (f.qAire / Q_AIRE_SOPLANTE));
      else f.aflojado = Math.max(0, f.aflojado - dt / 1800);

      // --- Retrolavado: desprende sólidos a suspensión; salen por BWO; sedimentan en reposo ---
      if (f.qBWI > 1) {
        const vChar = 220 - 130 * f.aflojado; // m³ de agua para remover 63 % de los sólidos
        const desprende = f.suciedad * ((f.qBWI * dt) / 3600 / vChar);
        f.suciedad -= desprende;
        f.susp += desprende;
        f.maduracion = 0.75;
      }
      const va = Math.max(f.volAgua, 1);
      const concSusp = (f.susp / va) * 1000; // mg/L
      const salidaSusp = Math.min(f.susp, (((f.qBWO + f.qRebalse) * concSusp) / 1000) * (dt / 3600));
      f.susp -= salidaSusp;
      if (f.qBWI < 1 && f.qAire < 100) {
        const sed = (f.susp * dt) / 150;
        f.susp -= sed;
        f.suciedad += sed;
      }
      f.turbBWO = f.qBWO > 1 ? concSusp / kTss : 0;
      qBWOtot += f.qBWO;
      turbBWOmasa += f.qBWO * f.turbBWO;

      // --- Cloro libre (regeneración / enjuague) ---
      const deficit = Math.max(0, p.cap_greensand_kg - f.capOx);
      const restaura = Math.min(deficit, ((0.003 * Math.min(f.cl, 1000)) / 100) * deficit * dt); // kg Mn
      f.capOx += restaura;
      const clConsumido = restaura * 1.3 * 1000; // g
      const masaCl = f.cl * va + (f.qRI * cRI * dt) / 3600 - ((f.qSEVO + f.qRW + f.qBWO + f.qRebalse) * f.cl * dt) / 3600 - clConsumido;
      const va2 = Math.max(f.volAgua, 1);
      f.cl = Math.max(0, masaCl / va2);
      f.cl *= Math.exp(-p.demanda_cl_s * dt);
      // agua entrante sin cloro por SEVI/BWI ya diluye vía balance de masa (volumen nuevo)
      qRWtot += f.qRW;
      clRWmasa += f.qRW * f.cl;

      // --- Calidad de salida de servicio ---
      const cs = copiaCalidad(this.c15);
      cs.turb = this.c15.turb * (1 - eta) + (f.cl > 0 ? 0 : 0);
      cs.fe = this.c15.fe * 0.05;
      cs.mn = this.c15.mn * (1 - etaMn);
      cs.cl = f.cl;
      f.calidadSalida = cs;
    });

    // ---------- 7. Agua filtrada, sumidero y TK-30016 ----------
    this.qFiltrada = this.filtros.reduce((s, f) => s + f.qSEVO, 0);
    this.cFiltrada = mezclar(this.filtros.map((f) => ({ q: f.qSEVO, c: f.calidadSalida })));
    this.qSumidero = this.qFiltrada + this.qBypass;
    this.cSumidero = mezclar([{ q: this.qFiltrada, c: this.cFiltrada }, { q: this.qBypass, c: this.c15 }]);
    this.qHDS16 = p.q_HDS_TK16_m3h;

    // Bombas de liberación por otros: PI sobre nivel de TK-30016
    const e16 = (this.L16 - p.tk16_SP_mm) / 1000;
    fr.liberacionI = Math.min(3000, Math.max(0, fr.liberacionI + 120 * e16 * dt));
    fr.qLiberacion = Math.min(3000, Math.max(0, fr.liberacionI + 1500 * e16));
    const qIn16 = this.qSumidero + this.qHDS16;
    const qOut16 = fr.qLiberacion + fr.qBW;
    this.L16 = Math.min(H_TK16, Math.max(0, this.L16 + ((qIn16 - qOut16) / A_TK16) * (1000 / 3600) * dt));

    // ---------- 8. Sumideros por otros ----------
    // Regeneración TK-30038
    const clRWin = qRWtot > 0 ? clRWmasa / qRWtot : 0;
    const vRegenAntes = this.vRegen;
    this.vRegen += ((qRWtot - fr.qRegen) * dt) / 3600;
    if (nivelRegenPct > 85) fr.evacRegen = true;
    if (nivelRegenPct < 50) fr.evacRegen = false;
    if (fr.evacRegen) this.vRegen -= (200 * dt) / 3600;
    this.vRegen = Math.min(p.sump_regen_m3, Math.max(0, this.vRegen));
    this.clRegen = Math.max(0, (this.clRegen * vRegenAntes + (qRWtot * clRWin * dt) / 3600 - (fr.qRegen * this.clRegen * dt) / 3600) / Math.max(this.vRegen, 1));
    this.clRegen *= Math.exp(-0.0002 * dt);
    // Desecho de retrolavado TK-30039
    const pctTK39 = (100 * this.vTK39) / p.tk39_m3;
    if (pctTK39 > 70) fr.evacBW = true;
    if (pctTK39 < 25) fr.evacBW = false;
    const qDrenajes = this.filtros.reduce((s, f) => s + f.qDrenaje, 0);
    const turbIn39 = qBWOtot > 0 ? turbBWOmasa / qBWOtot : 0;
    const v39a = this.vTK39;
    this.vTK39 += ((qBWOtot + qDrenajes - (fr.evacBW ? 300 : 0)) * dt) / 3600;
    this.vTK39 = Math.min(p.tk39_m3, Math.max(0, this.vTK39));
    this.turbTK39 = Math.max(0, (this.turbTK39 * v39a + (qBWOtot * turbIn39 * dt) / 3600 - (fr.evacBW ? (300 * this.turbTK39 * dt) / 3600 : 0)) / Math.max(this.vTK39, 1));
    this.turbTK39 *= Math.exp(-dt / 7200);

    // ---------- 9. Compresores y aireación TK-30015 ----------
    this.pasoCompresores(dt, io, tAmb);

    // ---------- 10. Química ----------
    this.pasoQuimica(dt, io);

    // ---------- 11. Motores ----------
    this.pasoMotores(dt, io, tAmb);

    // ---------- 12. Eléctrico ----------
    this.pasoBalance(dt);
    this.pasoElectrico(dt);

    // ---------- 13. Totalizadores ----------
    const h = dt / 3600;
    this.tot.entrada += this.qEntrada * h;
    this.tot.filtrada += this.qFiltrada * h;
    this.tot.bypass += this.qBypass * h;
    this.tot.retrolavado += fr.qBW * h;
    this.tot.regenRW += qRWtot * h;
    this.tot.rebalse15 += this.qRebalse15 * h;
    this.tot.acidoL += (fr.acidoLh + fr.acido16Lh) * h;
    this.tot.sodaL += fr.sodaLh * h;
    this.tot.naoclL += fr.naoclLh * h;
    this.tot.naptcL += (this.qEntrada > 0 ? p.naptc_Lh : 0) * h;
    this.tot.aireSopladoNm3 += this.qAireSoplado * h;

    // ---------- 14. Entradas al PLC ----------
    this.escribirEntradas(io);
  }

  // ---------------------------------------------------------------------
  private pasoSoplantes(dt: number, io: TablaIO, tAmb: number) {
    const p = this.p;
    let qTot = 0;
    for (const s of this.soplantes) {
      const correa = this.fallas.correaRota[s.motor.tag];
      s.q = correa ? 0 : Q_AIRE_SOPLANTE * s.motor.velocidad;
      // descarga manual cerrada: el soplante trabaja contra su PSV (no aporta al colector)
      const descargaAbierta = s.vDescarga ? (this.manuales[s.vDescarga] ?? true) : true;
      s.qPSV = descargaAbierta ? 0 : s.q;
      s.retencionAbierta = descargaAbierta && s.q > 1;
      if (descargaAbierta) qTot += s.q;
    }
    const hv639 = this.valvulasOnOff.get('HV-160305639')!;
    const pStat = this.filtros.map((f) => Math.max(0, ((f.h - 300) / 1000) * 9.81));
    const flujo = (pr: number) => {
      let airi = 0;
      this.filtros.forEach((f, i) => {
        airi += C_AIRE * f.valvulas.AIRI.apertura * Math.sqrt(Math.max(0, pr - pStat[i]));
      });
      const v639 = 80 * hv639.apertura * Math.sqrt(Math.max(0, pr));
      const psv = Math.max(0, pr - p.psv_soplante_kPag) * 4000;
      return { airi, v639, psv, tot: airi + v639 + psv };
    };
    let pr = 0;
    if (qTot > 1) {
      let lo = 0;
      let hi = 120;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (flujo(mid).tot > qTot) hi = mid;
        else lo = mid;
      }
      pr = (lo + hi) / 2;
    }
    // dinámica del colector (volumen)
    this.pAireSoplado += ((pr - this.pAireSoplado) * dt) / 1.5;
    const fl = flujo(this.pAireSoplado);
    const escala = qTot > 1 && fl.tot > 0 ? qTot / fl.tot : 0;
    this.qAirePSVsoplantes = fl.psv * escala + this.soplantes.reduce((a, s) => a + s.qPSV, 0);
    this.qAire639 = fl.v639 * escala;
    let airiTot = 0;
    this.filtros.forEach((f, i) => {
      f.qAire = qTot > 1 ? C_AIRE * f.valvulas.AIRI.apertura * Math.sqrt(Math.max(0, this.pAireSoplado - pStat[i])) * escala : 0;
      airiTot += f.qAire;
    });
    this.qAireSoplado = airiTot + this.qAire639;
    const T1 = tAmb + 273.15;
    for (const s of this.soplantes) {
      const corriendo = s.motor.velocidad > 0.05;
      s.pDescarga = !corriendo ? 0 : s.qPSV > 1 ? p.psv_soplante_kPag + 2 * (s.qPSV / Q_AIRE_SOPLANTE) : this.pAireSoplado;
      // manómetro local: aislamiento abierto y venteo cerrado → lee; aislado → presión atrapada; venteado → 0
      const aisl = s.vAislPI ? (this.manuales[s.vAislPI] ?? true) : true;
      const dren = s.vDrenPI ? (this.manuales[s.vDrenPI] ?? false) : false;
      if (dren) s.piLectura = 0;
      else if (aisl) s.piLectura = s.pDescarga;
      const ratio = (P_ATM_KPA + s.pDescarga) / P_ATM_KPA;
      const tObj = corriendo && s.q > 0 ? T1 * (1 + (ratio ** 0.2857 - 1) / 0.55) - 273.15 : tAmb;
      s.tDescarga += ((tObj - s.tDescarga) * dt) / (corriendo ? 40 : 600);
      s.kW = s.motor.kWabs * (0.15 + 0.85 * (s.pDescarga / DP_SOPLANTE) * (s.q / Q_AIRE_SOPLANTE));
    }
    void io;
  }

  private pasoCompresores(dt: number, io: TablaIO, tAmb: number) {
    const p = this.p;
    const T1 = tAmb + 273.15;
    const hv646 = this.valvulasOnOff.get('HV-160305646')!;
    let qTot = 0;
    for (const c of this.compresores) {
      const m = c.motor;
      const corriendo = m.velocidad > 0.95;
      c.tEstado += dt;
      if (!m.contactor) {
        c.estado = 'PARADO';
        c.tEstado = 0;
        c.tVacio = 0;
      } else if (c.estado === 'PARADO') {
        c.estado = 'ARRANCANDO';
        c.tEstado = 0;
        c.paradaVendor = false;
      } else if (c.estado === 'ARRANCANDO' && corriendo && c.tEstado > 10) {
        c.estado = 'CARGA';
        c.tEstado = 0;
      } else if (c.estado === 'CARGA' && c.pDescarga >= p.comp_descarga_kPa) {
        c.estado = 'VACIO';
        c.tEstado = 0;
      } else if (c.estado === 'VACIO' && c.pDescarga < p.comp_descarga_kPa - 20) {
        c.estado = 'CARGA';
        c.tEstado = 0;
      }
      if (c.estado === 'VACIO') {
        c.tVacio += dt;
        if (c.tVacio > p.comp_vacio_min * 60) c.paradaVendor = true;
      } else c.tVacio = 0;
      const valvulaAbierta = this.manuales[c.valvulaManual] ?? true;
      c.q = c.estado === 'CARGA' ? p.q_compresor_Nm3h * m.velocidad * (1 - 0.02 * Math.max(0, (c.pDescarga - 102) / 102)) : 0;
      // presión de descarga: columna de agua + pérdidas del difusor; bloqueado → sube hasta descargar
      const pRed = (this.L15 / 1000) * 9.81 + 48 * (Math.max(this.qAireTK15, c.q) / 350) ** 2;
      if (c.estado === 'PARADO') c.pDescarga = Math.max(0, c.pDescarga - dt * 5);
      else if (!valvulaAbierta) c.pDescarga = Math.min(p.comp_psv_kPag, c.pDescarga + (c.q > 0 ? 6 : -0.3) * dt);
      else c.pDescarga += ((pRed - c.pDescarga) * dt) / 12; // volumen de cañería + difusor
      if (valvulaAbierta) qTot += c.q;
      const ratio = (P_ATM_KPA + c.pDescarga) / P_ATM_KPA;
      const tObj = c.estado === 'CARGA' ? T1 * (1 + (ratio ** 0.2857 - 1) / p.comp_eta) - 273.15 : c.estado === 'PARADO' ? tAmb : tAmb + 40;
      c.tDescarga += ((tObj - c.tDescarga) * dt) / (c.estado === 'PARADO' ? 900 : 90);
      c.tAceite += (((m.contactor ? tAmb + 42 : tAmb) - c.tAceite) * dt) / 900;
      c.tRodLA += (((m.contactor ? tAmb + 38 : tAmb) - c.tRodLA) * dt) / 1200;
      c.tRodLOA += (((m.contactor ? tAmb + 33 : tAmb) - c.tRodLOA) * dt) / 1200;
      c.pAceite += (((m.contactor ? 210 * m.velocidad : 0) - c.pAceite) * dt) / 2;
      const objDp = this.fallas.filtroAireTapado[m.tag] ? 6.5 : 1.6;
      c.dpFiltro += (((m.contactor ? objDp : 0.1) - c.dpFiltro) * dt) / 60;
    }
    this.qAireComp = qTot;
    this.qAire646 = hv646.apertura * Math.min(qTot, 250);
    this.qAireTK15 = Math.max(0, qTot - this.qAire646);
    this.pAireComp = Math.max(...this.compresores.map((c) => c.pDescarga));
    void io;
  }

  private pasoQuimica(dt: number, io: TablaIO) {
    const p = this.p;
    const fr = this.frontera;
    const TC = p.T_agua_C;
    this.cEntrada = this.calidadEntrada();

    // Control de pH por otros (AIC-160305600) con el pH medido
    const e = this.pH15medido - p.pH_SP_TK15;
    const paroAcido = io.leerSalida('EXT-E4-STOP-ACIDO');
    const paroSoda = io.leerSalida('EXT-E5-STOP-SODA');
    const flujoActivo = this.qEntrada > 10;
    if (flujoActivo && !paroAcido) {
      fr.acidoI = Math.min(p.acido_max_Lh, Math.max(0, fr.acidoI + 0.5 * e * dt * (p.acido_max_Lh / 60)));
      fr.acidoLh = Math.min(p.acido_max_Lh, Math.max(0, fr.acidoI + 25 * e * (p.acido_max_Lh / 60)));
    } else {
      fr.acidoLh = 0;
      if (paroAcido) fr.acidoI = 0;
    }
    if (flujoActivo && !paroSoda) {
      fr.sodaI = Math.min(p.soda_max_Lh, Math.max(0, fr.sodaI - 0.5 * (e + 0.15) * dt * (p.soda_max_Lh / 60)));
      fr.sodaLh = Math.min(p.soda_max_Lh, Math.max(0, fr.sodaI - 25 * (e + 0.15) * (p.soda_max_Lh / 60)));
    } else {
      fr.sodaLh = 0;
      if (paroSoda) fr.sodaI = 0;
    }
    const eqAcido = fr.acidoLh * eqPorLitroAcido(p.acido_conc_pct);
    const eqSoda = fr.sodaLh * eqPorLitroSoda(p.soda_conc_pct);
    const V15 = (A_TK15 * this.L15) / 1000;
    const { co2: co2disuelto, sat } = co2(this.c15.alk, this.c15.ct, TC, P_ATM_KPA / 100);
    const kLa = 3 * (this.qAireTK15 / 350) + 0.05; // 1/h
    this.c15 = pasoCSTR(this.c15, V15, [{ q: this.qEntrada, c: this.cEntrada }], dt, {
      alk: eqSoda - eqAcido,
      ct: -kLa * (co2disuelto - sat) * V15,
      cond: 36 * eqAcido + 95 * eqSoda,
      so4: eqAcido * 48.03,
    });
    this.pH15 = phDesde(this.c15.alk, this.c15.ct, TC);
    this.pH15medido += ((this.pH15 - this.pH15medido) * dt) / 20;

    // TK-30016: mezcla + ácido por otros
    const V16 = (A_TK16 * this.L16) / 1000;
    const e16 = this.pH16 - p.pH_SP_TK16;
    fr.acido16I = Math.min(40, Math.max(0, fr.acido16I + 0.02 * e16 * dt));
    fr.acido16Lh = this.qSumidero > 10 ? Math.min(40, Math.max(0, fr.acido16I + 10 * e16)) : 0;
    const eq16 = fr.acido16Lh * eqPorLitroAcido(p.acido_conc_pct);
    this.c16 = pasoCSTR(this.c16, V16, [{ q: this.qSumidero, c: this.cSumidero }, { q: this.qHDS16, c: this.cHDS }], dt, {
      alk: -eq16, cond: 36 * eq16, so4: eq16 * 48.03,
    });
    this.c16.cl *= Math.exp(-dt / 3600);
    this.pH16 = phDesde(this.c16.alk, this.c16.ct, TC);
  }

  private pasoMotores(dt: number, io: TablaIO, tAmb: number) {
    for (const m of this.motores.values()) {
      const start = io.leerSalida(`${m.tag}-START`);
      const stop = io.leerSalida(`${m.tag}-STOP`);
      let kWcarga = m.kWabs;
      if (m.tag === '16045-AG-30006') kWcarga = this.L15 < 2794 ? m.kWabs * 0.55 : m.kWabs;
      if (m.tag === '16045-AG-30007') kWcarga = this.L16 < 4064 ? m.kWabs * 0.55 : m.kWabs;
      const sop = this.soplantes.find((s) => s.motor === m);
      if (sop) kWcarga = this.fallas.correaRota[m.tag] ? m.kWabs * 0.12 : Math.max(sop.kW, m.kWabs * 0.15);
      const comp = this.compresores.find((c) => c.motor === m);
      if (comp) {
        kWcarga = comp.estado === 'CARGA' ? m.kWabs : m.kWabs * 0.3;
        if (comp.paradaVendor) {
          // MK5 abre su contactor tras el tiempo en vacío
          m.contactor = false;
        }
      }
      m.actualizar(dt, start && !(comp?.paradaVendor ?? false), stop, kWcarga, tAmb);
    }
  }

  /** Balance de volumen de TK-30015 + 4 filtros: muestra de dónde sale el caudal (p. ej. acumulación de filtros en el enjuague). */
  private pasoBalance(dt: number) {
    const b = this.balance;
    const fs = this.filtros;
    const vol = (A_TK15 * this.L15) / 1000 + fs.reduce((s, f) => s + (A_FILTRO * f.h) / 1000, 0);
    const suma = (k: 'qBWI' | 'qRI' | 'qRW' | 'qBWO' | 'qRebalse' | 'qDrenaje') => fs.reduce((s, f) => s + f[k], 0);
    b.entrada = this.qEntrada;
    b.retrolavado = suma('qBWI');
    b.regeneracion = suma('qRI');
    b.filtrada = this.qFiltrada;
    b.rw = suma('qRW');
    b.bwo = suma('qBWO');
    b.bypass = this.qBypass;
    b.otras = this.qRebalse15 + this.qDrenaje15 + this.qDrenajeBypass + suma('qRebalse') + suma('qDrenaje');
    b.entradas = b.entrada + b.retrolavado + b.regeneracion;
    b.salidas = b.filtrada + b.rw + b.bwo + b.bypass + b.otras;
    b.acumulacion = b.vol > 0 ? ((vol - b.vol) / dt) * 3600 : 0;
    b.cierre = b.entradas - b.salidas - b.acumulacion;
    b.vol = vol;
  }

  private pasoElectrico(dt: number) {
    const k: Record<string, number> = {};
    for (const c of electrico.cargas) {
      const m = this.motores.get(c.tag);
      if (m) k[c.tag] = m.kW;
    }
    const cm1 = this.motor('16045-CM-30011');
    const cm2 = this.motor('16045-CM-30012');
    k['16045-CM-30011-CC'] = cm1.contactor ? 3.5 : 0.06;
    k['16045-CM-30012-CC'] = cm2.contactor ? 3.5 : 0.06;
    k['BL-30008-ENC'] = this.motor('16045-BL-30008').contactor ? 0.3984 : 0;
    k['BL-30009-ENC'] = this.motor('16045-BL-30009').contactor ? 0.3984 : 0;
    k['16045-PK-30005JB'] = this.fallas.ups120 ? 0 : 0.048;
    this.kWcargas = k;
    this.kWtotal = Object.values(k).reduce((a, b) => a + b, 0);
    const kW460 = electrico.cargas.filter((c) => c.V === 460).reduce((s, c) => s + (k[c.tag] ?? 0), 0);
    this.kVA460 = kW460 / 0.88;
    // corriente de barra: suma de corrientes de motores (incluye 6×FLA en arranques DOL) + resto de cargas 460 V
    const iMotores = [...this.motores.values()].reduce((s, m) => s + m.corriente, 0);
    const kWresto = electrico.cargas.filter((c) => c.V === 460 && !this.motores.has(c.tag)).reduce((s, c) => s + (k[c.tag] ?? 0), 0);
    this.I460 = iMotores + (kWresto * 1000) / (Math.sqrt(3) * this.p.v_bus_460 * 0.88);
    this.kWh += (this.kWtotal * dt) / 3600;
  }

  // ---------------------------------------------------------------------
  private escribirAI(io: TablaIO, tag: string, eu: number, sigma: number, corte = 0) {
    const f = this.fallas.transmisor[tag];
    if (!this.aiAlimentada(tag)) {
      io.escribirAImA(tag, 0);
      return;
    }
    let v = eu + this.ruido(sigma);
    if (f && f.modo !== 'ok') {
      if (f.modo === 'bajo') return io.escribirAImA(tag, 3.6);
      if (f.modo === 'alto') return io.escribirAImA(tag, 21.5);
      if (f.modo === 'abierto') return io.escribirAImA(tag, 0);
      if (f.modo === 'congelado') {
        if (!this.aiCongelado.has(tag)) this.aiCongelado.set(tag, io.punto(tag).origen);
        return io.escribirAImA(tag, this.aiCongelado.get(tag)!);
      }
      if (f.modo === 'deriva') {
        f.acumulado = (f.acumulado ?? 0) + ((f.deriva ?? 0) * 0.5) / 3600;
        v += f.acumulado;
      }
    } else this.aiCongelado.delete(tag);
    // corte de bajo caudal del transmisor
    if (corte > 0 && v < corte) v = 0;
    io.escribirAI(tag, v);
  }

  private escribirEntradas(io: TablaIO) {
    // AIs
    for (const f of this.filtros) this.escribirAI(io, f.lit, this.litFiltro(f), 3);
    this.escribirAI(io, 'LIT-160305601', this.L15, 6);
    this.escribirAI(io, 'AIT-160305600', this.pH15medido, 0.01);
    this.escribirAI(io, 'AIT-160305442', this.c15.cond, 4);
    this.escribirAI(io, 'FIT-160305602', this.qAireComp, 0.8, 15);
    this.escribirAI(io, 'FIT-160305607', this.qAireSoplado, 8, 100);
    this.escribirAI(io, 'FIT-160305603', this.qFIT603, 2.5, 13);
    this.escribirAI(io, 'FZI-160305603', this.fv603.pos * 100, 0.1);
    // Finales de carrera
    // finales de carrera: sin 24 VDC del panel del cliente ambos quedan en 0
    for (const v of this.valvulasOnOff.values()) {
      io.escribirCampo(`${v.tag}-ZSO`, this.alimIOCliente && v.zso);
      io.escribirCampo(`${v.tag}-ZSC`, this.alimIOCliente && v.zsc);
    }
    // Motores
    for (const m of this.motores.values()) {
      io.escribirCampo(`${m.tag}-RUN`, m.contactor);
      io.escribirCampo(`${m.tag}-AVL`, m.disponible);
      io.escribirCampo(`${m.tag}-CP`, !m.sinTensionControl);
      io.escribirCampo(`${m.tag}-FLT`, m.falla);
      io.escribirCampo(`${m.tag}-LOC`, m.selector === 'LOCAL');
    }
    // Interfaz con otros
    const fr = this.frontera;
    io.escribirCOM('FIC-160305065', this.qRO);
    io.escribirCOM('FIC-160304333', this.qHDS);
    io.escribirCOM('LIT-160305276', this.L16 + this.ruido(5));
    io.escribirCOM('AIT-160305288', this.pH16);
    io.escribirCOM('EXT-FI-RETROLAVADO', fr.qBW);
    io.escribirCOM('EXT-LI-TK30038', (100 * this.vRegen) / this.p.sump_regen_m3);
    io.escribirCOM('EXT-PU-30407-08-AVL', !this.fallas.bombaRetrolavado);
    io.escribirCOM('EXT-PU-30407-08-RUN', fr.bombaBW);
    io.escribirCOM('EXT-PU-30169-70-AVL', !this.fallas.bombaRegeneracion);
    io.escribirCOM('EXT-PU-30169-70-RUN', fr.bombaRegen);
    io.escribirCOM('EXT-PU-30236-37-AVL', !this.fallas.bombaNaOCl);
    io.escribirCOM('EXT-PU-30236-37-RUN', fr.bombaNaOCl);

  }

  /** Inyección/limpieza de fallas de fin de carrera y válvulas trabadas. */
  setFallaValvula(tag: string, trabada: boolean, fc: FallaFinCarrera) {
    if (tag === 'FV-160305603') {
      this.fv603.trabada = trabada;
      return;
    }
    const v = this.valvulasOnOff.get(tag);
    if (!v) return;
    v.trabada = trabada;
    v.fallaFC = fc;
  }
}

export const CONST_PLANTA = { A_TK15, A_TK16, A_FILTRO, ALTO_FILTRO_MM, ESPESOR_MEDIO_MM, L_NORMAL_TK15, H_TK16, Q_AIRE_SOPLANTE, P_ATM_KPA };
