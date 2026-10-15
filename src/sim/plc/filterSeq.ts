// Máquina de estados de un filtro según la filosofía de control rev005 (17 pasos + HOLD).
// Lee solo valores de I/O (vía el contexto) y produce comandos de válvulas y pedidos de equipos.
import { proceso, COLUMNA_SECUENCIA, FUNCIONES_VALVULA, type FuncionValvula } from '../../data';
import type { Params } from '../params';

export const SECUENCIA = proceso.filtros.secuencia;
export const NOMBRE_PASO = (n: number) => SECUENCIA.find((s) => s.paso === n)?.nombre ?? `PASO ${n}`;

export type BotonFiltro =
  | 'OFFLINE' | 'STANDBY' | 'SERVICE' | 'BACKWASH' | 'REGENERATION' | 'NORMAL' | 'PROLONG'
  | 'STEP_ADVANCE' | 'HOLD' | 'RESUME' | 'AUTO' | 'SEMIAUTO';

export type Valvulas = Record<FuncionValvula, boolean>;

export interface CtxFiltro {
  dt: number;
  p: Params;
  litEU: number;
  litMala: boolean;
  /** Alarma de nivel alto que pide lavado (LAHH según filosofía o LAH según C&E) activa */
  lahh: boolean;
  /** LAL del filtro activa */
  lal: boolean;
  zso: Valvulas;
  zsc: Valvulas;
  /** alguna ZAO/ZAC activa en las 7 válvulas del filtro */
  discrepancia: string | null;
  todos: SecuenciaFiltro[];
  soplanteDisponible: boolean;
  soplanteEnMarcha: boolean;
  bombaBWDisponible: boolean;
  bombaBWEnMarcha: boolean;
  caudalBWAlarma: boolean;
  bombaRegenDisponible: boolean;
  bombaRegenEnMarcha: boolean;
  nivelSumideroRegen: number;
  /** TK-30015 por debajo de la caja de salida */
  tk15Bajo: boolean;
}

export interface SalidaFiltro {
  valvulas: Valvulas;
  pideSoplante: boolean;
  pide639: boolean;
  pideBW: boolean;
  pideRegen: boolean;
  pideNaOCl: boolean;
}

const cerradas = (): Valvulas => ({ SEVI: false, RI: false, BWO: false, FRO: false, BWI: false, SEVO: false, AIRI: false });

/** Matriz de válvulas documentada para un paso (O = true). */
export function matrizPaso(paso: number): Valvulas {
  const s = SECUENCIA.find((x) => x.paso === paso);
  const v = cerradas();
  if (!s) return v;
  for (const fn of FUNCIONES_VALVULA) v[fn] = s.valvulas[COLUMNA_SECUENCIA[fn]] === 'O';
  return v;
}

const PASOS_LAVADO = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const PASOS_TEMPORIZADOS: Record<number, string> = {
  7: 'T07_s', 8: 'T08_s', 10: 'T10_s', 11: 'T11_s', 12: 'T12_s', 13: 'T13_s', 14: 'T14_s', 15: 'T15_s', 16: 'T16_s',
};

export class SecuenciaFiltro {
  paso = 1;
  hold = false;
  holdCausa: string | null = null;
  modo: 'AUTO' | 'SEMIAUTO' = 'SEMIAUTO';
  prolongar = false;
  /** tiempo en el paso (s), se conserva en HOLD */
  tPaso = 0;
  /** servicio desde último lavado (s) – T03 */
  tServicioLavado = 0;
  /** servicio desde última regeneración (s) – K03 */
  tServicioRegen = 0;
  /** tiempo de servicio acumulado total (h) – TQI */
  tqi = 0;
  regenRequerida = false;
  huboRegen = false;
  pedidoStepAdvance = false;
  sevoCerradaAnormal = false;
  permisivoK12 = true;
  esperandoStepAdvance = false;
  lavados = 0;
  regeneraciones = 0;
  ultimoMotivoLavado = '';
  private botones: BotonFiltro[] = [];
  salida: SalidaFiltro = { valvulas: cerradas(), pideSoplante: false, pide639: false, pideBW: false, pideRegen: false, pideNaOCl: false };

  constructor(readonly idx: number, readonly tag: string) {}

  boton(b: BotonFiltro) {
    this.botones.push(b);
  }

  get enServicio() {
    return this.paso === 3 || this.paso === 4;
  }
  get enLavado() {
    return PASOS_LAVADO.includes(this.paso);
  }
  get nombrePaso() {
    return NOMBRE_PASO(this.paso);
  }
  /** Timer que se compara con el preset: en Service (paso 3) es T03, el servicio acumulado desde el último lavado. */
  get timerPaso(): number {
    return this.paso === 3 ? this.tServicioLavado : this.tPaso;
  }

  /** Preset del timer del paso actual (s), o null. */
  preset(p: Params): number | null {
    if (this.paso === 3) return p.T03_servicio_desde_ultimo_lavado_min * 60;
    if (this.paso === 6) return p.T06_s;
    if (this.paso === 9) return p.T09_s;
    const k = PASOS_TEMPORIZADOS[this.paso];
    return k ? p[k] : null;
  }

  private irA(paso: number) {
    this.paso = paso;
    this.tPaso = 0;
    this.pedidoStepAdvance = false;
    this.esperandoStepAdvance = false;
  }

  private ponerHold(causa: string) {
    if (this.hold) return;
    this.hold = true;
    this.holdCausa = causa;
  }

  // ---------------------------------------------------------------
  scan(ctx: CtxFiltro) {
    const { dt } = ctx;
    const otros = ctx.todos.filter((f) => f !== this);

    // ---- Botones del PCS ----
    const pasoInicial = this.paso;
    for (const b of this.botones.splice(0)) this.procesarBoton(b, ctx, otros);

    // ---- Contadores de servicio ----
    if (this.enServicio && !this.hold) {
      this.tServicioLavado += dt;
      this.tServicioRegen += dt;
      this.tqi += dt / 3600;
    }

    // ---- HOLD por dispositivo ----
    if (!this.hold && this.paso >= 2 && ctx.discrepancia) this.ponerHold(`Discrepancia de válvula: ${ctx.discrepancia}`);

    // una sola transición por scan: si un botón cambió el paso, las condiciones se evalúan en el próximo
    if (!this.hold && this.paso === pasoInicial) {
      this.tPaso += dt;
      this.transiciones(ctx, otros);
    }
    this.salida = this.calcularSalidas(ctx);
  }

  private procesarBoton(b: BotonFiltro, ctx: CtxFiltro, otros: SecuenciaFiltro[]) {
    const semi = this.modo === 'SEMIAUTO';
    switch (b) {
      case 'AUTO':
        this.modo = 'AUTO';
        break;
      case 'SEMIAUTO':
        this.modo = 'SEMIAUTO';
        break;
      case 'NORMAL':
        this.prolongar = false;
        break;
      case 'PROLONG':
        this.prolongar = true;
        break;
      case 'OFFLINE':
        // desde Standby, o abortar una secuencia en HOLD
        if (this.paso === 1 || this.hold) {
          this.hold = false;
          this.holdCausa = null;
          this.irA(0);
        }
        break;
      case 'STANDBY':
        if (this.paso === 0) this.irA(1);
        else if (semi && !this.hold && (this.paso === 2 || this.paso === 3)) this.irA(1);
        break;
      case 'SERVICE':
        if (semi && this.paso === 1 && !otros.some((f) => f.paso === 2)) this.irA(2);
        break;
      case 'BACKWASH':
      case 'REGENERATION':
        if (!semi) break;
        if (b === 'REGENERATION') this.regenRequerida = true;
        if (this.paso === 3) {
          this.ultimoMotivoLavado = b === 'REGENERATION' ? 'Operador (regeneración)' : 'Operador';
          this.irA(4);
        } else if (this.paso === 1) {
          this.ultimoMotivoLavado = 'Operador desde Standby';
          this.irA(5);
        }
        break;
      case 'STEP_ADVANCE':
        if (this.paso >= 6 && !this.hold) this.pedidoStepAdvance = true;
        break;
      case 'HOLD':
        if (this.paso >= 2) this.ponerHold('Botón Hold');
        break;
      case 'RESUME':
        if (this.hold) {
          if (this.paso === 7 && !ctx.soplanteDisponible) break;
          if (this.paso === 10 && !ctx.bombaBWDisponible) break;
          if (ctx.discrepancia) break;
          this.hold = false;
          this.holdCausa = null;
        }
        break;
    }
  }

  private permisivoLavado(otros: SecuenciaFiltro[]): boolean {
    if (otros.some((f) => f.paso === 1)) return false;
    if (otros.some((f) => f.enLavado || f.paso === 5)) return false;
    // prioridad entre filtros en "Backwashing Required": mayor tiempo de servicio, empate → orden 35/36/37/38
    const competidores = otros.filter((f) => f.paso === 4);
    return !competidores.some((f) => f.tServicioLavado > this.tServicioLavado || (f.tServicioLavado === this.tServicioLavado && f.idx < this.idx));
  }

  private transiciones(ctx: CtxFiltro, otros: SecuenciaFiltro[]) {
    const { p } = ctx;
    const z0 = p.z0_LIT_mm;
    const avanzar = () => {
      const fin = this.pedidoStepAdvance;
      this.pedidoStepAdvance = false;
      return fin;
    };
    const temporizado = (preset: number) => {
      const vencido = this.tPaso >= preset;
      if (this.pedidoStepAdvance) return avanzar();
      return vencido && !this.prolongar;
    };

    switch (this.paso) {
      case 0:
        break;
      case 1: {
        if (this.modo === 'AUTO') {
          const enServicio = ctx.todos.filter((f) => f.paso >= 2 && f.paso <= 4).length;
          const candidatos = ctx.todos.filter((f) => f.paso === 1 && f.modo === 'AUTO');
          const elegido = candidatos.sort((a, b) => b.tqi - a.tqi || a.idx - b.idx)[0];
          if (enServicio < 4 && elegido === this && !otros.some((f) => f.paso === 2)) this.irA(2);
        }
        break;
      }
      case 2: {
        const todasCerradas = Object.values(ctx.zsc).every(Boolean);
        if (todasCerradas) this.irA(3);
        break;
      }
      case 3: {
        const t03 = p.T03_servicio_desde_ultimo_lavado_min * 60;
        if (ctx.lahh) {
          this.ultimoMotivoLavado = `${p.lavado_por_LAH ? 'LAH' : 'LAHH'} nivel de filtro`;
          this.irA(4);
        } else if (this.tServicioLavado >= t03) {
          this.ultimoMotivoLavado = 'T03 vencido';
          this.irA(4);
        }
        break;
      }
      case 4:
        if (this.tServicioRegen >= p.K03_servicio_desde_ultima_regen_min * 60) this.regenRequerida = true;
        if (this.permisivoLavado(otros)) this.irA(5);
        break;
      case 5:
        if (!otros.some((f) => f.enLavado) && ctx.soplanteDisponible) {
          this.huboRegen = false;
          this.irA(6);
        }
        break;
      case 6:
        if (!ctx.litMala && ctx.litEU <= p.K06_mm - z0) this.irA(7);
        else if (this.pedidoStepAdvance) {
          avanzar();
          this.irA(7);
        } else if (this.tPaso > p.T06_s) this.ponerHold('T06 vencido sin alcanzar K06');
        break;
      case 7:
        if (!ctx.soplanteDisponible && !ctx.soplanteEnMarcha) this.ponerHold('Soplantes no disponibles en paso 7');
        else if (temporizado(p.T07_s)) this.irA(8);
        break;
      case 8:
        if (temporizado(p.T08_s)) this.irA(9);
        break;
      case 9:
        if (!ctx.litMala && ctx.litEU >= p.K09_mm - z0) this.irA(10);
        else if (this.pedidoStepAdvance) {
          avanzar();
          this.irA(10);
        } else if (this.tPaso > p.T09_s) this.ponerHold('T09 vencido sin alcanzar K09');
        break;
      case 10:
        if (!ctx.bombaBWDisponible) this.ponerHold('Bombas de retrolavado no disponibles en paso 10');
        else if (ctx.caudalBWAlarma) this.ponerHold('Alarma de caudal de retrolavado (por otros) en paso 10');
        else if (temporizado(p.T10_s)) this.irA(11);
        break;
      case 11:
        if (temporizado(p.T11_s)) this.irA(this.regenRequerida ? 12 : 15);
        break;
      case 12:
        this.permisivoK12 = ctx.nivelSumideroRegen >= p.K12_pct;
        if (!this.permisivoK12) {
          this.tPaso = 0; // el timer no corre sin permisivo
          break;
        }
        if (!ctx.bombaRegenDisponible) this.ponerHold('Bombas de regeneración no disponibles (supuesto)');
        else if (temporizado(p.T12_s)) this.irA(13);
        break;
      case 13:
        this.huboRegen = true;
        if (!ctx.bombaRegenDisponible) this.ponerHold('Bombas de regeneración no disponibles (supuesto)');
        else if (temporizado(p.T13_s)) this.irA(14);
        break;
      case 14:
        if (temporizado(p.T14_s)) this.irA(15);
        break;
      case 15:
        // T15 mínimo + Step Advance del operador (ORP verificado por muestra manual)
        this.esperandoStepAdvance = this.tPaso >= p.T15_s;
        if (this.esperandoStepAdvance && this.pedidoStepAdvance) {
          avanzar();
          this.irA(16);
        } else if (!this.esperandoStepAdvance) this.pedidoStepAdvance = false;
        break;
      case 16:
        if (temporizado(p.T16_s)) {
          this.tServicioLavado = 0;
          this.lavados++;
          if (this.huboRegen) {
            this.tServicioRegen = 0;
            this.regenRequerida = false;
            this.regeneraciones++;
          }
          this.huboRegen = false;
          // Auto → Service (vía Service Pending, uno a la vez); Semiauto → Standby
          this.irA(this.modo === 'AUTO' && !otros.some((f) => f.paso === 2) ? 2 : 1);
        }
        break;
    }

    // Condición anormal de nivel (respuesta CRS en filosofía): cerrar SEVO en servicio y reabrir al recuperar
    if (this.enServicio) {
      if (ctx.tk15Bajo || (!ctx.litMala && ctx.lal)) this.sevoCerradaAnormal = true;
      else if (this.sevoCerradaAnormal && !ctx.tk15Bajo && ctx.litEU >= p.nivel_reapertura_SEVO_mm) this.sevoCerradaAnormal = false;
    } else this.sevoCerradaAnormal = false;
  }

  private calcularSalidas(ctx: CtxFiltro): SalidaFiltro {
    const s: SalidaFiltro = { valvulas: cerradas(), pideSoplante: false, pide639: false, pideBW: false, pideRegen: false, pideNaOCl: false };
    if (this.hold || this.paso === 0) return s; // HOLD: cierran las 7 válvulas y paran equipos
    const { p } = ctx;
    const espera = p.espera_valvulas_s;
    const v = matrizPaso(this.paso);
    switch (this.paso) {
      case 3:
      case 4:
        if (this.sevoCerradaAnormal) v.SEVO = false;
        break;
      case 7:
        s.pideSoplante = ctx.zso.AIRI;
        break;
      case 8:
        s.pide639 = true;
        break;
      case 10: {
        // cierra SEVI, espera, abre BWI y BWO, arranca bomba
        const listo = this.tPaso >= espera;
        v.BWI = listo;
        v.BWO = listo;
        s.pideBW = listo && ctx.zso.BWI && ctx.zso.BWO;
        break;
      }
      case 11:
        // para bomba, espera, cierra BWI/BWO
        v.BWI = this.tPaso < espera;
        v.BWO = this.tPaso < espera;
        break;
      case 12:
      case 13:
        if (!this.permisivoK12 && this.paso === 12) {
          v.RI = false;
          v.FRO = false;
        }
        s.pideRegen = v.RI && ctx.zso.RI && ctx.zso.FRO;
        s.pideNaOCl = this.paso === 13 && s.pideRegen && ctx.bombaRegenEnMarcha;
        break;
      case 14:
        v.RI = this.tPaso < espera;
        v.FRO = this.tPaso < espera;
        break;
    }
    s.valvulas = v;
    return s;
  }
}
