// Dispositivos de campo: válvulas on/off Tipo V5, válvula de control FV-603 y motores con su arrancador (MCC por otros).
import { cargaPorTag } from '../../data';

export type FallaFinCarrera = 'ok' | 'zso_trabado_0' | 'zsc_trabado_0' | 'zso_trabado_1' | 'zsc_trabado_1';

/** Válvula on/off neumática doble efecto, solenoide 4/5 vías bobina simple (energizado = abrir). */
export class ValvulaOnOff {
  pos = 0; // 0 = cerrada, 1 = abierta
  trabada = false;
  fallaFC: FallaFinCarrera = 'ok';
  /** Accionamiento manual (override) — solo en sitio */
  carreras = 0;
  private movAnterior = 0;

  constructor(
    readonly tag: string,
    readonly funcion: string,
    readonly filtro: number | null,
    readonly diametroIn: number,
  ) {}

  /**
   * @param solenoide comando DO tal como llega al campo (después de forzados y fallas de alimentación)
   * @param aireOk presión de aire suficiente para mover el actuador
   * Tipo V5: sin aire queda en la última posición (FL). Sin 24 VDC el solenoide se desenergiza → cierra (si hay aire).
   */
  actualizar(dt: number, solenoide: boolean, aireOk: boolean, tiempoCarrera: number): number {
    if (this.trabada || !aireOk) return 0;
    const objetivo = solenoide ? 1 : 0;
    const v = dt / Math.max(tiempoCarrera, 0.1);
    const antes = this.pos;
    if (this.pos < objetivo) this.pos = Math.min(1, this.pos + v);
    else if (this.pos > objetivo) this.pos = Math.max(0, this.pos - v);
    const mov = Math.sign(this.pos - antes);
    if (mov !== 0 && mov !== this.movAnterior) this.carreras++;
    this.movAnterior = mov;
    // consumo de aire aproximado mientras se mueve (Nm³/h equivalentes)
    return mov !== 0 ? 0.004 * this.diametroIn * this.diametroIn : 0;
  }

  get zso(): boolean {
    if (this.fallaFC === 'zso_trabado_0') return false;
    if (this.fallaFC === 'zso_trabado_1') return true;
    return this.pos >= 0.98;
  }

  get zsc(): boolean {
    if (this.fallaFC === 'zsc_trabado_0') return false;
    if (this.fallaFC === 'zsc_trabado_1') return true;
    return this.pos <= 0.02;
  }

  /** Fracción de apertura hidráulica (mariposa: característica aproximada de igual porcentaje). */
  get apertura(): number {
    if (this.pos <= 0.02) return 0;
    return Math.min(1, this.pos ** 1.6);
  }
}

/** FV-160305603: mariposa triple excéntrica, aire-abre / resorte-cierra (falla CERRADA), posicionador 4–20 mA. */
export class ValvulaControl {
  pos = 0; // 0..1 posición real
  trabada = false;
  constructor(readonly tag: string) {}

  actualizar(dt: number, mA: number, aireKPag: number, tau: number) {
    if (this.trabada) return;
    let objetivo = 0;
    // Sin señal (< 3.8 mA) o sin aire, el resorte cierra
    if (mA >= 3.8 && aireKPag > 200) objetivo = Math.min(1, Math.max(0, (mA - 4) / 16));
    const vmax = 0.25 * dt; // 25 %/s de velocidad máxima de carrera
    const d = ((objetivo - this.pos) * dt) / Math.max(tau, dt);
    this.pos += Math.max(-vmax, Math.min(vmax, d));
    this.pos = Math.min(1, Math.max(0, this.pos));
  }

  /** Fracción de Cv instalado (lineal modificada): Cv(30 %) ≈ 26 % de Cv(100 %). */
  get fraccionCv(): number {
    return this.pos <= 0.005 ? 0 : this.pos ** 1.15;
  }
}

export type Selector = 'LOCAL' | 'OFF' | 'REMOTO';

/** Motor de BT con arranque directo (DOL) y relé inteligente (MPR). */
export class Motor {
  contactor = false;
  velocidad = 0; // 0..1
  /** Falla de sobrecarga / tierra / desbalance (MPR) — enclavada hasta reset en el MPR */
  falla = false;
  sinTensionControl = false;
  noArranca = false; // inyección: el contactor no cierra
  estop = false; // hongo de la LCS enclavado
  jog = false; // pulsador START/JOG de la LCS (mientras se mantiene apretado)
  selector: Selector = 'REMOTO';
  horas = 0;
  arranques = 0;
  tempDevanado: number;
  corriente = 0;
  kW = 0;
  kWh = 0;
  readonly kWnom: number;
  readonly kWabs: number;
  readonly V: number;
  readonly fp: number;
  readonly ef: number;
  readonly fla: number;
  readonly tieneLCS: boolean;

  constructor(
    readonly tag: string,
    readonly tiempoAceleracion: number,
    tieneLCS: boolean,
    tAmb: number,
  ) {
    const c = cargaPorTag(tag);
    this.kWnom = c?.kW_nom ?? 1;
    this.kWabs = c?.kW_abs ?? 1;
    this.V = c?.V ?? 460;
    this.fp = c?.fp ?? 0.85;
    this.ef = c?.ef ?? 0.9;
    this.fla = (this.kWnom * 1000) / (Math.sqrt(3) * this.V * this.fp * this.ef);
    this.tieneLCS = tieneLCS;
    this.tempDevanado = tAmb;
  }

  /** Disponible: tensión de control, sin falla, sin E-Stop y en REMOTO. */
  get disponible(): boolean {
    return !this.sinTensionControl && !this.falla && !this.estop && this.selector === 'REMOTO';
  }

  get enMarcha(): boolean {
    return this.contactor;
  }

  /**
   * Lógica del arrancador (cableada en el MCC) y dinámica del motor.
   * @param start pulso START del PLC (DO)  @param stop pulso STOP del PLC (DO)
   * @param kWcarga potencia absorbida por la carga en régimen (kW)
   */
  actualizar(dt: number, start: boolean, stop: boolean, kWcarga: number, tAmb: number, potenciaOk = true) {
    const seguridadOk = !this.estop && !this.falla && !this.sinTensionControl && potenciaOk;
    const antes = this.contactor;
    if (!seguridadOk || this.selector === 'OFF') {
      this.contactor = false;
    } else if (this.selector === 'LOCAL') {
      // En LOCAL solo JOG desde la LCS; se inhiben los interlocks de proceso
      this.contactor = this.jog && !this.noArranca;
    } else {
      if (stop) this.contactor = false;
      else if (start && !this.noArranca) this.contactor = true;
    }
    if (this.contactor && !antes) this.arranques++;

    // Dinámica de velocidad
    if (this.contactor) this.velocidad = Math.min(1, this.velocidad + dt / this.tiempoAceleracion);
    else this.velocidad = Math.max(0, this.velocidad - dt / (this.tiempoAceleracion * 3));

    // Corriente: arranque DOL ≈ 6×FLA hasta ~85 % de velocidad
    if (this.contactor) {
      const kWel = kWcarga * Math.max(this.velocidad, 0.15);
      const Ireg = (kWel * 1000) / (Math.sqrt(3) * this.V * this.fp);
      this.corriente = this.velocidad < 0.85 ? Math.max(6 * this.fla * (1 - this.velocidad * 0.5), Ireg) : Ireg;
      this.kW = this.velocidad < 0.85 ? Math.sqrt(3) * this.V * this.corriente * 0.3 / 1000 : kWel;
      this.horas += dt / 3600;
    } else {
      this.corriente = 0;
      this.kW = 0;
    }
    this.kWh += (this.kW * dt) / 3600;

    // Temperatura de devanado (modelo térmico de 1er orden, τ = 20 min)
    const carga = this.fla > 0 ? this.corriente / this.fla : 0;
    const tObj = tAmb + 75 * carga * carga;
    this.tempDevanado += ((tObj - this.tempDevanado) * dt) / 1200;
  }

  resetMPR() {
    this.falla = false;
  }
}
