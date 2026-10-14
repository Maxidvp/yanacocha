// Gestor de alarmas tipo ISA-18.2: retardo de activación, histéresis (en el llamador), reconocimiento e historial.

export type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';

export interface AlarmaDef {
  id: string;
  tag: string;
  texto: string;
  prioridad: Prioridad;
  retardo: number;
  grupo: string;
  /** origen documental */
  fuente?: string;
}

export interface AlarmaEstado {
  def: AlarmaDef;
  activa: boolean;
  reconocida: boolean;
  tActivacion: number | null;
  tNormalizacion: number | null;
  timer: number;
  inhibida: boolean;
  valor?: number;
}

export interface EventoAlarma {
  t: number;
  id: string;
  texto: string;
  prioridad: Prioridad;
  evento: 'ACTIVA' | 'NORMAL' | 'RECONOCIDA' | 'INFO';
}

export class GestorAlarmas {
  readonly estados = new Map<string, AlarmaEstado>();
  readonly historial: EventoAlarma[] = [];
  private t = 0;

  definir(def: AlarmaDef) {
    if (!this.estados.has(def.id)) {
      this.estados.set(def.id, { def, activa: false, reconocida: true, tActivacion: null, tNormalizacion: null, timer: 0, inhibida: false });
    }
    return this.estados.get(def.id)!;
  }

  setTiempo(t: number) {
    this.t = t;
  }

  /** Evalúa una condición con retardo de activación. Devuelve si la alarma está activa. */
  evaluar(id: string, condicion: boolean, dt: number, valor?: number, inhibida = false): boolean {
    const e = this.estados.get(id);
    if (!e) throw new Error(`Alarma no definida: ${id}`);
    e.inhibida = inhibida;
    if (valor !== undefined) e.valor = valor;
    const cond = condicion && !inhibida;
    if (cond) {
      e.timer += dt;
      if (!e.activa && e.timer >= e.def.retardo) {
        e.activa = true;
        e.reconocida = false;
        e.tActivacion = this.t;
        e.tNormalizacion = null;
        this.registrar(e, 'ACTIVA');
      }
    } else {
      e.timer = 0;
      if (e.activa) {
        e.activa = false;
        e.tNormalizacion = this.t;
        this.registrar(e, 'NORMAL');
      }
    }
    return e.activa;
  }

  activa(id: string) {
    return this.estados.get(id)?.activa ?? false;
  }

  reconocer(id: string) {
    const e = this.estados.get(id);
    if (!e || e.reconocida) return;
    e.reconocida = true;
    this.registrar(e, 'RECONOCIDA');
  }

  reconocerTodas() {
    for (const id of this.estados.keys()) this.reconocer(id);
  }

  info(texto: string, id = 'INFO') {
    this.historial.push({ t: this.t, id, texto, prioridad: 'BAJA', evento: 'INFO' });
    this.recortar();
  }

  private registrar(e: AlarmaEstado, evento: EventoAlarma['evento']) {
    this.historial.push({ t: this.t, id: e.def.id, texto: e.def.texto, prioridad: e.def.prioridad, evento });
    this.recortar();
  }

  private recortar() {
    if (this.historial.length > 5000) this.historial.splice(0, this.historial.length - 5000);
  }

  /** Alarmas a mostrar: activas o normalizadas sin reconocer. */
  get resumen(): AlarmaEstado[] {
    return [...this.estados.values()].filter((e) => e.activa || !e.reconocida);
  }
}
