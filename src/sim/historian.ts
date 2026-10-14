// Historiador: buffers circulares de series muestreadas a intervalo fijo de tiempo simulado.

export interface SerieDef {
  id: string;
  label: string;
  unidad: string;
  grupo: string;
  leer: () => number;
  min?: number;
  max?: number;
}

export class Historiador {
  readonly cap: number;
  readonly t: Float64Array;
  readonly datos = new Map<string, Float32Array>();
  n = 0; // muestras escritas totales
  private acum = 0;

  constructor(
    readonly series: SerieDef[],
    readonly intervalo = 5,
    horas = 24,
  ) {
    this.cap = Math.ceil((horas * 3600) / intervalo);
    this.t = new Float64Array(this.cap);
    for (const s of series) this.datos.set(s.id, new Float32Array(this.cap));
  }

  paso(dt: number, tSim: number) {
    this.acum += dt;
    if (this.acum + 1e-9 < this.intervalo && this.n > 0) return;
    this.acum = 0;
    const i = this.n % this.cap;
    this.t[i] = tSim;
    for (const s of this.series) this.datos.get(s.id)![i] = s.leer();
    this.n++;
  }

  /** Devuelve las muestras de la ventana [tSim − ventana, tSim], en orden cronológico. */
  ventana(id: string, desde: number): { t: number[]; v: number[] } {
    const d = this.datos.get(id);
    const out = { t: [] as number[], v: [] as number[] };
    if (!d) return out;
    const total = Math.min(this.n, this.cap);
    const inicio = this.n - total;
    for (let k = inicio; k < this.n; k++) {
      const i = k % this.cap;
      if (this.t[i] < desde) continue;
      out.t.push(this.t[i]);
      out.v.push(d[i]);
    }
    return out;
  }

  ultimo(id: string): number {
    if (this.n === 0) return NaN;
    return this.datos.get(id)![(this.n - 1) % this.cap];
  }

  /** Exporta CSV de todas las series en la ventana pedida. */
  csv(desde: number): string {
    const total = Math.min(this.n, this.cap);
    const inicio = this.n - total;
    const filas = [['t_s', ...this.series.map((s) => `${s.id} [${s.unidad}]`)].join(',')];
    for (let k = inicio; k < this.n; k++) {
      const i = k % this.cap;
      if (this.t[i] < desde) continue;
      filas.push([this.t[i].toFixed(1), ...this.series.map((s) => this.datos.get(s.id)![i].toPrecision(6))].join(','));
    }
    return filas.join('\n');
  }
}
