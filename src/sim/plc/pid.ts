// PID posicional con error normalizado al span, anti-windup por limitación del integral y transferencia sin salto.

export class PID {
  salida = 0;
  integral = 0;
  private pvAnterior: number | null = null;

  constructor(
    public Kc: number,
    public Ti: number,
    public Td: number,
    /** acción inversa: la salida sube cuando PV < SP (e = SP − PV) */
    public inversa = true,
  ) {}

  /**
   * @returns salida en % (0–100)
   */
  calcular(sp: number, pv: number, dt: number, span: number): number {
    const e = (100 * (this.inversa ? sp - pv : pv - sp)) / span;
    const p = this.Kc * e;
    let d = 0;
    if (this.Td > 0 && this.pvAnterior !== null) {
      const dpv = (100 * (pv - this.pvAnterior)) / span;
      d = (this.inversa ? -1 : 1) * this.Kc * this.Td * (dpv / dt);
    }
    this.pvAnterior = pv;
    const di = this.Ti > 0 ? (this.Kc * e * dt) / this.Ti : 0;
    let integral = this.integral + di;
    // anti-windup: el integral no crece más allá de lo necesario para saturar
    if (p + integral + d > 100 && di > 0) integral = Math.max(this.integral, 100 - p - d);
    if (p + integral + d < 0 && di < 0) integral = Math.min(this.integral, -p - d);
    this.integral = integral;
    this.salida = Math.min(100, Math.max(0, p + this.integral + d));
    return this.salida;
  }

  /** Seguimiento en manual (bumpless): el integral sigue a la salida manual. */
  seguir(salida: number, sp: number, pv: number, span: number) {
    const e = (100 * (this.inversa ? sp - pv : pv - sp)) / span;
    this.integral = salida - this.Kc * e;
    this.salida = salida;
    this.pvAnterior = pv;
  }
}
