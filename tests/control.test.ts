import { describe, expect, test } from 'vitest';
import { proceso } from '../src/data';
import { defaultParams } from '../src/sim/params';
import { TablaIO } from '../src/sim/io/iotable';
import { PLC } from '../src/sim/plc/plc';
import { PID } from '../src/sim/plc/pid';

describe('Cálculo de SP del bypass FY-160305603', () => {
  const casos = proceso.control_bypass.tabla_escenarios;

  test.each(casos.map((c) => [c.entrada, c.bypass, c.en_servicio, c.nota ?? ''] as const))(
    'entrada %d m³/h → bypass %d m³/h (%d en servicio) %s',
    (entrada, bypass, _enServicio, nota) => {
      const p = defaultParams();
      const io = new TablaIO(p);
      const plc = new PLC(io, p);
      const fuera = nota.startsWith('2 fuera') ? 2 : nota.startsWith('1 filtro fuera') ? 1 : 0;
      plc.filtros.forEach((f, i) => (f.paso = i < fuera ? 0 : 3));
      io.escribirCOM('FIC-160305065', entrada * 0.7);
      io.escribirCOM('FIC-160304333', entrada * 0.3);
      plc.scan(0.5);
      expect(plc.spFY).toBeCloseTo(bypass, 0);
    },
  );

  test('modo: entrada < 2032 → FV al 0 %; ≥ 2032 → FIC en Auto', () => {
    const p = defaultParams();
    const io = new TablaIO(p);
    const plc = new PLC(io, p);
    plc.filtros.forEach((f) => (f.paso = 3));
    io.escribirCOM('FIC-160305065', 1500);
    io.escribirCOM('FIC-160304333', 500);
    plc.scan(0.5);
    expect(plc.autoEfectivoFIC).toBe(false);
    expect(plc.salidaFIC).toBe(0);
    io.escribirCOM('FIC-160304333', 532);
    plc.scan(0.5);
    expect(plc.autoEfectivoFIC).toBe(true);
    expect(plc.salidaFIC).toBeGreaterThan(0);
  });

  test('SP limitado al tope mecánico de 853 m³/h', () => {
    const p = defaultParams();
    const io = new TablaIO(p);
    const plc = new PLC(io, p);
    plc.filtros.forEach((f) => (f.paso = 0));
    io.escribirCOM('FIC-160305065', 2000);
    io.escribirCOM('FIC-160304333', 400);
    plc.scan(0.5);
    expect(plc.capacidadFiltros).toBe(0);
    expect(plc.spFY).toBe(853);
  });
});

describe('PID', () => {
  /** Planta de primer orden: caudal = 853·u/100 con constante de tiempo de 3 s. */
  function lazo(pid: PID, sp: number, seg: number, pv0 = 0) {
    let pv = pv0;
    const dt = 0.5;
    for (let t = 0; t < seg; t += dt) {
      const u = pid.calcular(sp, pv, dt, 1280);
      pv += ((853 * (u / 100) - pv) * dt) / 3;
    }
    return pv;
  }

  test('acción inversa: la salida sube si PV < SP', () => {
    const pid = new PID(0.6, 12, 0, true);
    const u = pid.calcular(500, 100, 0.5, 1280);
    expect(u).toBeGreaterThan(0);
  });

  test('converge al SP sin error de régimen', () => {
    const pid = new PID(0.6, 12, 0, true);
    expect(lazo(pid, 261, 300)).toBeCloseTo(261, 0);
    expect(lazo(pid, 615, 300, 261)).toBeCloseTo(615, 0);
  });

  test('anti-windup: tras saturar en 100 % se recupera rápido', () => {
    const pid = new PID(0.6, 12, 0, true);
    // SP inalcanzable (planta máx. 853) durante 10 min
    lazo(pid, 1200, 600);
    expect(pid.salida).toBe(100);
    expect(pid.integral).toBeLessThanOrEqual(100 + 1e-6);
    // al bajar el SP, la salida abandona la saturación en pocos segundos
    let pv = 853;
    let t = 0;
    while (pid.calcular(400, pv, 0.5, 1280) >= 99.9 && t < 60) {
      pv += ((853 * (pid.salida / 100) - pv) * 0.5) / 3;
      t += 0.5;
    }
    expect(t).toBeLessThan(5);
  });

  test('transferencia sin salto (manual → auto)', () => {
    const pid = new PID(0.6, 12, 0, true);
    pid.seguir(40, 300, 300, 1280);
    const u = pid.calcular(300, 300, 0.5, 1280);
    expect(u).toBeCloseTo(40, 6);
  });
});
