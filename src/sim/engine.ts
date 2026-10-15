// Motor de simulación: integra Planta (proceso) → TablaIO → PLC a paso fijo de 0.5 s.
import { filtrosEquipo, LETRA_FILTRO } from '../data';
import { defaultParams, type Params } from './params';
import { TablaIO } from './io/iotable';
import { Planta, CONST_PLANTA, type FallaTransmisor } from './process/plant';
import type { FallaFinCarrera, Selector } from './process/devices';
import { PLC, type ComandoHMI } from './plc/plc';
import { Historiador, type SerieDef } from './historian';
import { orpEstimado, phDesde } from './process/water';

export const DT = 0.5;

export interface Escenario {
  id: string;
  nombre: string;
  descripcion: string;
}

export const ESCENARIOS: Escenario[] = [
  { id: 'normal', nombre: 'Operación normal – 1472 m³/h', descripcion: 'Promedio anual. 4 filtros en Auto/Servicio con tiempos de servicio escalonados; compresor CM-30011 en marcha; bypass cerrado.' },
  { id: 'lavado', nombre: 'Lavado + regeneración inminente (filtro A)', descripcion: 'Igual que normal, pero el filtro A está a 1 min de vencer T03 y con K03 cumplido: recorre los 17 pasos completos.' },
  { id: 'diseno', nombre: 'Caudal de diseño – 2032 m³/h', descripcion: 'Entrada ≥ 2032 m³/h: FIC-160305603 pasa a Auto con SP = 2032 − 1771 = 261 m³/h de bypass.' },
  { id: 'optimista', nombre: 'Caudal optimista – 2386 m³/h', descripcion: 'Bypass de 615 m³/h; filtros a 443–590 m³/h.' },
  { id: 'minimo', nombre: 'Caudal mínimo – 410 m³/h', descripcion: '103 m³/h por filtro: nivel bajo en filtros y lógica de condición anormal (cierre/reapertura de SEVO).' },
  { id: 'mantenimiento', nombre: 'Filtro D fuera de servicio + 2032 m³/h', descripcion: 'Filtro D en OFFLINE: capacidad 1179 m³/h, bypass 853 m³/h (tope).' },
  { id: 'arranque', nombre: 'Arranque inicial (filosofía)', descripcion: 'Sin caudal de entrada, 4 filtros en Semiauto/Standby, equipos parados. Pasar cada filtro a Service y luego a Auto.' },
];

export class Engine {
  params: Params;
  readonly io: TablaIO;
  readonly planta: Planta;
  readonly plc: PLC;
  readonly hist: Historiador;
  readonly escenario: string;
  t = 0;
  pasos = 0;
  /** muestras manuales de cloro/ORP (paso 15) */
  muestras: { t: number; filtro: string; cl: number; orp: number }[] = [];

  constructor(escenario = 'normal', params?: Params) {
    this.escenario = escenario;
    this.params = params ? { ...params } : defaultParams();
    this.aplicarParamsEscenario();
    this.io = new TablaIO(this.params);
    this.planta = new Planta(this.params);
    this.plc = new PLC(this.io, this.params);
    this.condicionesIniciales();
    this.hist = new Historiador(this.seriesHistorian(), 5, 24);
    // pre-calentamiento: estabiliza hidráulica y lazos sin registrar historia; luego se restauran contadores
    const contadores = this.plc.filtros.map((s) => [s.tServicioLavado, s.tServicioRegen] as const);
    for (let i = 0; i < 600; i++) this.paso(false);
    this.plc.filtros.forEach((s, i) => {
      [s.tServicioLavado, s.tServicioRegen] = contadores[i];
    });
    if (this.escenario === 'lavado') {
      const p = this.params;
      this.plc.filtros[0].tServicioLavado = p.T03_servicio_desde_ultimo_lavado_min * 60 - 60;
      this.plc.filtros[0].tServicioRegen = p.K03_servicio_desde_ultima_regen_min * 60 + 600;
      this.plc.filtros[3].tServicioLavado = 6 * 3600;
    }
    this.t = 0;
    this.planta.t = 0;
    this.plc.t = 0;
    this.plc.alarmas.setTiempo(0);
    this.plc.alarmas.historial.splice(0);
    this.plc.alarmas.info(`Inicio de simulación – escenario: ${ESCENARIOS.find((e) => e.id === escenario)?.nombre ?? escenario}`);
    this.hist.paso(0, 0);
  }

  private aplicarParamsEscenario() {
    const p = this.params;
    const set = (total: number) => {
      p.q_RO_m3h = Math.round(total * 0.7);
      p.q_HDS_m3h = total - p.q_RO_m3h;
    };
    if (this.escenario === 'diseno' || this.escenario === 'mantenimiento') set(2032);
    if (this.escenario === 'optimista') set(2386);
    if (this.escenario === 'minimo') set(410);
    if (this.escenario === 'arranque') set(0);
  }

  private condicionesIniciales() {
    const pl = this.planta;
    const plc = this.plc;
    const p = this.params;
    const arranque = this.escenario === 'arranque';
    const qEntrada = p.q_RO_m3h + p.q_HDS_m3h;
    const enServicio = this.escenario === 'mantenimiento' ? 3 : 4;
    const qFiltro = Math.min(590, qEntrada / enServicio);

    // TK-30015 en régimen del vertedero
    const cw = 1771 / ((CONST_PLANTA.L_NORMAL_TK15 - p.tk15_vertedero_mm) / 1000) ** 1.5;
    pl.L15 = arranque ? 5200 : p.tk15_vertedero_mm + 1000 * (Math.min(qEntrada, 1771) / cw) ** (2 / 3);

    const horas = [2, 8, 14, 20];
    const diasRegen = [1, 2, 3, 3.8];
    pl.filtros.forEach((f, i) => {
      const s = plc.filtros[i];
      const fueraServicio = arranque || (this.escenario === 'mantenimiento' && i === 3);
      f.suciedad = arranque ? 2 : horas[i] * 2.8 * (qFiltro / 368);
      const R = p.R_limpio * (1 + p.alfa_colmatacion * f.suciedad);
      f.h = fueraServicio ? p.z0_LIT_mm + 1100 : p.z_salida_filtrada_mm + R * qFiltro;
      s.tServicioLavado = horas[i] * 3600;
      s.tServicioRegen = diasRegen[i] * 86400;
      s.tqi = 1500 + 100 * i;
      if (fueraServicio) {
        s.paso = arranque ? 1 : 0;
        s.modo = 'SEMIAUTO';
      } else {
        s.paso = 3;
        s.modo = 'AUTO';
        f.valvulas.SEVI.pos = 1;
        f.valvulas.SEVO.pos = 1;
      }
    });

    if (!arranque) {
      for (const tag of ['16045-CM-30011', '16045-AG-30006', '16045-AG-30007']) {
        const m = pl.motor(tag);
        m.contactor = true;
        m.velocidad = 1;
        const b = plc.motor(tag);
        b.cmdRun = true;
        b.run = true;
        if (!b.deSecuencia) b.pedidoManual = true;
      }
      pl.compresores[0].estado = 'CARGA';
      pl.compresores[0].pDescarga = 102;
    } else {
      plc.aireacionHabilitada = false;
    }
    // TK-30016 y química en régimen
    pl.inicializarQuimica();
    pl.L16 = p.tk16_SP_mm;
    pl.frontera.liberacionI = qEntrada;
  }

  // ------------------------------------------------------------------
  private paso(registrar = true) {
    const dt = DT;
    // selector L/O/R configurado en el PCS → MCC (por comunicación)
    for (const [tag, b] of this.plc.motores) this.planta.motor(tag).selector = b.selector;
    this.planta.step(dt, this.io);
    this.plc.scan(dt);
    // alarmas de sistema del simulador (no pasan por el PLC)
    this.plc.alarmas.evaluar('PAL-AIRE-INST', this.planta.pAireInst < 550, dt, this.planta.pAireInst);
    this.plc.alarmas.evaluar('CM-MK5-VACIO', this.planta.compresores.some((c) => c.paradaVendor), dt);
    this.t += dt;
    this.pasos++;
    if (registrar) this.hist.paso(dt, this.t);
  }

  private acum = 0;
  /** Avanza acumulando fracciones de paso (para el lazo de tiempo real). Limita el trabajo por llamada. */
  avanzarAcumulado(segundos: number, maxPasos = 4000) {
    this.acum += segundos;
    let n = 0;
    while (this.acum >= DT && n < maxPasos) {
      this.paso();
      this.acum -= DT;
      n++;
    }
    if (n >= maxPasos) this.acum = 0;
  }

  /** Avanza la simulación un tiempo simulado (s). */
  avanzar(segundos: number) {
    const n = Math.max(1, Math.round(segundos / DT));
    for (let i = 0; i < n; i++) this.paso();
  }

  cmd(c: ComandoHMI) {
    this.plc.comando(c);
  }

  setParam(key: string, v: number) {
    this.params = { ...this.params, [key]: v };
    this.planta.setParams(this.params);
    this.plc.setParams(this.params);
    this.io.params = this.params;
  }

  // ---- acciones de campo y fallas ----
  setEstop(tag: string, v: boolean) {
    this.planta.motor(tag).estop = v;
  }
  setJog(tag: string, v: boolean) {
    this.planta.motor(tag).jog = v;
  }
  resetMPR(tag: string) {
    this.planta.motor(tag).resetMPR();
  }
  setMotorFalla(tag: string, tipo: 'falla' | 'noArranca' | 'sinTensionControl', v: boolean) {
    this.planta.motor(tag)[tipo] = v;
  }
  setManual(tag: string, abierta: boolean) {
    this.planta.manuales[tag] = abierta;
  }
  setFallaValvula(tag: string, trabada: boolean, fc: FallaFinCarrera = 'ok') {
    this.planta.setFallaValvula(tag, trabada, fc);
  }
  setFallaTransmisor(tag: string, f: FallaTransmisor) {
    if (f.modo === 'ok') delete this.planta.fallas.transmisor[tag];
    else this.planta.fallas.transmisor[tag] = { ...f, acumulado: 0 };
  }
  setFallaGlobal(k: 'aireInstrumentos' | 'ups120' | 'dc24' | 'dc24Cliente' | 'bombaRetrolavado' | 'bombaRegeneracion' | 'bombaNaOCl', v: boolean) {
    this.planta.fallas[k] = v;
  }
  setFallaEquipo(k: 'correaRota' | 'filtroAireTapado', tag: string, v: boolean) {
    this.planta.fallas[k][tag] = v;
  }
  setSelector(tag: string, s: Selector) {
    this.cmd({ tipo: 'selector', tag, valor: s });
  }

  /** Muestra manual (paso 15: "ORP verificado por muestra manual"). */
  tomarMuestra(i: number) {
    const f = this.planta.filtros[i];
    const pH = phDesde(this.planta.c15.alk, this.planta.c15.ct, this.params.T_agua_C);
    const m = { t: this.t, filtro: `${LETRA_FILTRO[i]}`, cl: f.cl, orp: orpEstimado(f.cl, pH) };
    this.muestras.unshift(m);
    this.muestras.splice(30);
    this.plc.alarmas.info(`Muestra manual filtro ${m.filtro}: Cl libre ${m.cl.toFixed(2)} mg/L, ORP ≈ ${m.orp.toFixed(0)} mV`);
    return m;
  }

  // ------------------------------------------------------------------
  private seriesHistorian(): SerieDef[] {
    const pl = this.planta;
    const plc = this.plc;
    const pv = (tag: string) => () => plc.pv[tag]?.eu ?? NaN;
    const s: SerieDef[] = [
      { id: 'LIT-160305601', label: 'Nivel TK-30015', unidad: 'mm', grupo: 'TK-30015', leer: pv('LIT-160305601'), min: 0, max: 6400 },
      { id: 'AIT-160305600', label: 'pH TK-30015', unidad: 'pH', grupo: 'TK-30015', leer: pv('AIT-160305600'), min: 5.5, max: 7.5 },
      { id: 'AIT-160305442', label: 'Conductividad salida TK-30015', unidad: 'µS/cm', grupo: 'TK-30015', leer: pv('AIT-160305442') },
      { id: 'FIT-160305602', label: 'Aire compresores', unidad: 'Nm³/h', grupo: 'Aire', leer: pv('FIT-160305602'), min: 0, max: 525 },
      { id: 'FIT-160305607', label: 'Aire soplantes', unidad: 'Nm³/h', grupo: 'Aire', leer: pv('FIT-160305607'), min: 0, max: 4000 },
      { id: 'FIT-160305603', label: 'Caudal bypass', unidad: 'm³/h', grupo: 'Bypass', leer: pv('FIT-160305603'), min: 0, max: 1280 },
      { id: 'FY-160305603', label: 'SP calculado FY-603', unidad: 'm³/h', grupo: 'Bypass', leer: () => plc.spFY, min: 0, max: 1280 },
      { id: 'FZI-160305603', label: 'Posición FV-603', unidad: '%', grupo: 'Bypass', leer: pv('FZI-160305603'), min: 0, max: 100 },
      { id: 'FCV-160305603', label: 'Salida FIC-603', unidad: '%', grupo: 'Bypass', leer: () => plc.salidaFIC, min: 0, max: 100 },
      { id: 'Q-ENTRADA', label: 'Entrada TK-30015 (FIC-065 + FIC-333)', unidad: 'm³/h', grupo: 'Caudales', leer: () => pl.qEntrada, min: 0, max: 2500 },
      { id: 'Q-FILTROS', label: 'Caudal a filtros', unidad: 'm³/h', grupo: 'Caudales', leer: () => pl.qAFiltros, min: 0, max: 2500 },
      { id: 'Q-FILTRADA', label: 'Agua filtrada total', unidad: 'm³/h', grupo: 'Caudales', leer: () => pl.qFiltrada, min: 0, max: 2500 },
      { id: 'Q-RETROLAVADO', label: 'Caudal de retrolavado', unidad: 'm³/h', grupo: 'Caudales', leer: () => pl.frontera.qBW, min: 0, max: 2000 },
      { id: 'KW-TOTAL', label: 'Potencia total', unidad: 'kW', grupo: 'Eléctrico', leer: () => pl.kWtotal, min: 0 },
      { id: 'I-460', label: 'Corriente barra 460 V', unidad: 'A', grupo: 'Eléctrico', leer: () => pl.I460, min: 0 },
      { id: 'TURB-FILTRADA', label: 'Turbidez agua filtrada', unidad: 'NTU', grupo: 'Calidad', leer: () => pl.cFiltrada.turb, min: 0 },
      { id: 'MN-FILTRADA', label: 'Mn agua filtrada', unidad: 'mg/L', grupo: 'Calidad', leer: () => pl.cFiltrada.mn, min: 0 },
      { id: 'TURB-TK16', label: 'Turbidez TK-30016', unidad: 'NTU', grupo: 'Calidad', leer: () => pl.c16.turb, min: 0 },
      { id: 'LIT-160305276', label: 'Nivel TK-30016', unidad: 'mm', grupo: 'TK-30016', leer: pv('LIT-160305276'), min: 0, max: 11500 },
      { id: 'AIT-160305288', label: 'pH TK-30016', unidad: 'pH', grupo: 'TK-30016', leer: pv('AIT-160305288'), min: 5.5, max: 8 },
      { id: 'LI-TK30038', label: 'Nivel sumidero regeneración', unidad: '%', grupo: 'Sumideros', leer: pv('EXT-LI-TK30038'), min: 0, max: 100 },
      { id: 'P-AIRE-INST', label: 'Presión aire instrumentos', unidad: 'kPag', grupo: 'Servicios', leer: () => pl.pAireInst, min: 0, max: 800 },
      { id: 'P-SOPLADO', label: 'Presión colector soplantes', unidad: 'kPag', grupo: 'Aire', leer: () => pl.pAireSoplado, min: 0, max: 80 },
    ];
    filtrosEquipo.forEach((f, i) => {
      const L = LETRA_FILTRO[i];
      s.push({ id: f.transmisor_nivel, label: `Nivel filtro ${L}`, unidad: 'mm', grupo: `Filtro ${L}`, leer: pv(f.transmisor_nivel), min: 0, max: 2980 });
      s.push({ id: `Q-SEVO-${L}`, label: `Caudal filtrado ${L}`, unidad: 'm³/h', grupo: `Filtro ${L}`, leer: () => pl.filtros[i].qSEVO, min: 0, max: 800 });
      s.push({ id: `PASO-${L}`, label: `Paso de secuencia ${L}`, unidad: 'paso', grupo: `Filtro ${L}`, leer: () => plc.filtros[i].paso, min: 0, max: 16 });
      s.push({ id: `SUC-${L}`, label: `Sólidos retenidos ${L}`, unidad: 'kg', grupo: `Filtro ${L}`, leer: () => pl.filtros[i].suciedad, min: 0 });
      s.push({ id: `CL-${L}`, label: `Cloro libre filtro ${L}`, unidad: 'mg/L', grupo: `Filtro ${L}`, leer: () => pl.filtros[i].cl, min: 0 });
      s.push({ id: `CAPOX-${L}`, label: `Capacidad oxidativa ${L}`, unidad: '%', grupo: `Filtro ${L}`, leer: () => (100 * pl.filtros[i].capOx) / this.params.cap_greensand_kg, min: 0, max: 100 });
    });
    return s;
  }

  /** Porcentaje del agua tratada que pasa por filtros (objetivo ≥ 87 %). */
  get pctFiltrado() {
    const tot = this.planta.qFiltrada + this.planta.qBypass;
    return tot > 1 ? (100 * this.planta.qFiltrada) / tot : 100;
  }
}
