// Bloques de control de dispositivos del PLC: motores (Start/Stop/Running/Available + FTS) y válvulas on/off (A/M + discrepancia).
import type { TablaIO } from '../io/iotable';
import type { Selector } from '../process/devices';

export class BloqueMotor {
  modoAM: 'AUTO' | 'MANUAL';
  selector: Selector = 'REMOTO';
  pedidoManual = false;
  cmdRun = false;
  pulsoStart = 0;
  pulsoStop = 0;
  tFTS = 0;
  fts = false;
  /** marcha interrumpida sin pedido (disparo de campo) — para duty/standby */
  falloMarcha = false;
  bloqueo: string | null = null;
  run = false;
  avl = false;
  flt = false;
  cp = true;

  constructor(
    readonly tag: string,
    readonly retardoFTS: number,
    readonly deSecuencia: boolean,
  ) {
    this.modoAM = deSecuencia ? 'AUTO' : 'MANUAL';
  }

  leer(io: TablaIO) {
    this.run = io.di(`${this.tag}-RUN`);
    this.avl = io.di(`${this.tag}-AVL`);
    this.flt = io.di(`${this.tag}-FLT`);
    this.cp = io.di(`${this.tag}-CP`);
  }

  /** Disponible para la lógica: DI Available, sin FTS enclavada y sin bloqueo de interlock. */
  get utilizable() {
    return this.avl && !this.fts && !this.bloqueo;
  }

  /**
   * @param pedidoAuto demanda de la lógica (si está en AUTO)
   * @param bloqueo texto del interlock que impide marchar (para y bloquea), o null
   */
  actualizar(dt: number, io: TablaIO, pedidoAuto: boolean, bloqueo: string | null, pulso: number) {
    this.bloqueo = bloqueo;
    const remoto = this.selector === 'REMOTO';
    const deseado = remoto && !bloqueo && !this.fts && (this.modoAM === 'AUTO' ? pedidoAuto : this.pedidoManual);
    this.pulsoStart = Math.max(0, this.pulsoStart - dt);
    this.pulsoStop = Math.max(0, this.pulsoStop - dt);
    this.falloMarcha = false;

    if (!remoto) {
      this.cmdRun = false;
    } else if (deseado && !this.cmdRun) {
      this.cmdRun = true;
      this.tFTS = 0;
      if (!this.run) this.pulsoStart = pulso;
    } else if (!deseado && (this.cmdRun || this.run)) {
      if (this.cmdRun || this.pulsoStop <= 0) this.pulsoStop = pulso;
      this.cmdRun = false;
      this.pulsoStart = 0;
    }

    if (this.cmdRun) {
      if (!this.run) {
        this.tFTS += dt;
        if (this.tFTS >= this.retardoFTS) {
          // Falla al arrancar o parada no comandada
          this.fts = this.tFTS >= this.retardoFTS;
          this.falloMarcha = true;
          this.cmdRun = false;
          this.pulsoStop = pulso;
          if (this.modoAM === 'MANUAL') this.pedidoManual = false;
        }
      } else this.tFTS = 0;
    }
    io.escribirDO(`${this.tag}-START`, this.pulsoStart > 0);
    io.escribirDO(`${this.tag}-STOP`, this.pulsoStop > 0);
  }

  reset() {
    this.fts = false;
    this.tFTS = 0;
  }
}

export class BloqueValvula {
  modo: 'AUTO' | 'MANUAL' = 'AUTO';
  cmdManual = false;
  cmdAuto = false;
  salida = false;
  zso = false;
  zsc = false;
  zao = false;
  zac = false;
  private tDisc = 0;
  private salidaAnterior = false;

  constructor(
    readonly tag: string,
    readonly funcion: string,
    readonly filtro: number | null,
    readonly retardo: number,
  ) {}

  leer(io: TablaIO) {
    this.zso = io.di(`${this.tag}-ZSO`);
    this.zsc = io.di(`${this.tag}-ZSC`);
  }

  actualizar(dt: number, io: TablaIO) {
    this.salida = this.modo === 'MANUAL' ? this.cmdManual : this.cmdAuto;
    if (this.salida !== this.salidaAnterior) this.tDisc = 0;
    this.salidaAnterior = this.salida;
    const enPosicion = this.salida ? this.zso && !this.zsc : this.zsc && !this.zso;
    if (enPosicion) {
      this.tDisc = 0;
      this.zao = false;
      this.zac = false;
    } else {
      this.tDisc += dt;
      if (this.tDisc >= this.retardo) {
        if (this.salida) this.zao = true;
        else this.zac = true;
      }
    }
    io.escribirDO(this.tag, this.salida);
  }

  resetDiscrepancia() {
    this.zao = false;
    this.zac = false;
    this.tDisc = 0;
  }

  get estado(): 'ABIERTA' | 'CERRADA' | 'MOVIENDO' | 'ERROR' {
    if (this.zso && this.zsc) return 'ERROR';
    if (this.zso) return 'ABIERTA';
    if (this.zsc) return 'CERRADA';
    return 'MOVIENDO';
  }
}
