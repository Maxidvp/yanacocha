// Válvulas manuales: estación de bypass FV-160305603 (P&ID) y tren de descarga de soplantes.
import { describe, expect, test } from 'vitest';
import { Engine } from '../src/sim/engine';

describe('Estación de bypass FV-160305603', () => {
  test('VBF-309709 rodea la estación: el caudal llega al sumidero pero la FIT no lo mide', () => {
    const e = new Engine('normal');
    e.setManual('16045-VBF-309709', true);
    e.avanzar(60);
    expect(e.planta.qBypass709).toBeGreaterThan(500);
    expect(e.planta.qBypass).toBeCloseTo(e.planta.qBypassFV + e.planta.qBypass709, 6);
    expect(e.plc.pv['FIT-160305603'].eu).toBeLessThan(30);
  });

  test('VBF-309704 cerrada: la FV abierta al 100 % no deja pasar caudal', () => {
    const e = new Engine('normal');
    e.cmd({ tipo: 'fic', modo: 'MANUAL', salida: 100 });
    e.avanzar(60);
    expect(e.planta.qBypassFV).toBeGreaterThan(400);
    e.setManual('16045-VBF-309704', false);
    e.avanzar(30);
    expect(e.planta.qBypassFV).toBe(0);
    expect(e.plc.pv['FIT-160305603'].eu).toBeLessThan(30);
  });

  test('drenajes de ½″: VBA-309705 drena con la línea cargada; VBA-309707 además mide en la FIT', () => {
    const e = new Engine('normal');
    e.setManual('16045-VBA-309705', true);
    e.avanzar(5);
    expect(e.planta.qDrenajeBypass).toBeCloseTo(e.params.q_drenaje_bypass_m3h, 0);
    e.setManual('16045-VBA-309705', false);
    e.setManual('16045-VBA-309707', true);
    e.setManual('16045-VBF-309708', false);
    e.cmd({ tipo: 'fic', modo: 'MANUAL', salida: 50 });
    e.avanzar(60);
    expect(e.planta.qBypassFV).toBe(0);
    expect(e.planta.qFIT603).toBeCloseTo(e.planta.qDrenajeBypass, 6);
    expect(e.planta.qDrenajeBypass).toBeGreaterThan(1);
  });
});

describe('Tren de descarga de soplantes', () => {
  const arrancar = (e: Engine, tag: string) => {
    e.cmd({ tipo: 'motor', tag, accion: 'MANUAL' });
    e.cmd({ tipo: 'motor', tag, accion: 'START' });
  };

  test('válvulas manuales asignadas a cada soplante según la lista de válvulas', () => {
    const e = new Engine('normal');
    const [a, b] = e.planta.soplantes;
    expect([a.vRetencion, a.vAislPI, a.vDrenPI, a.vDescarga]).toEqual(['16045-VCH-309710', '16045-VBA-309711', '16045-VBA-309712', '16045-VBF-309713']);
    expect([b.vRetencion, b.vAislPI, b.vDrenPI, b.vDescarga]).toEqual(['16045-VCH-309714', '16045-VBA-309715', '16045-VBA-309716', '16045-VBF-309717']);
  });

  test('descarga cerrada: el soplante alivia por su PSV, la retención queda cerrada y FALL-607 dispara E10', () => {
    const e = new Engine('normal');
    e.setManual('16045-VBF-309713', false);
    arrancar(e, '16045-BL-30008');
    e.avanzar(20);
    const s = e.planta.soplantes[0];
    expect(s.motor.velocidad).toBeGreaterThan(0.9);
    expect(s.qPSV).toBeGreaterThan(2000);
    expect(s.pDescarga).toBeGreaterThanOrEqual(e.params.psv_soplante_kPag);
    expect(s.retencionAbierta).toBe(false);
    expect(e.planta.qAireSoplado).toBeLessThan(1);
    // sin caudal en FIT-160305607 → FALL (30 s) → disparo E10 de los soplantes (C&E)
    e.avanzar(30);
    expect(e.plc.disparo('E10')).toBe(true);
  });

  test('manómetro PI-160305605: aislado retiene la última presión, venteado lee 0', () => {
    const e = new Engine('normal');
    arrancar(e, '16045-BL-30008');
    e.avanzar(40);
    const s = e.planta.soplantes[0];
    const p = s.pDescarga;
    expect(p).toBeGreaterThan(10);
    expect(s.piLectura).toBeCloseTo(p, 6);
    e.setManual('16045-VBA-309711', false);
    e.cmd({ tipo: 'motor', tag: '16045-BL-30008', accion: 'STOP' });
    e.avanzar(40);
    expect(s.pDescarga).toBe(0);
    expect(s.piLectura).toBeCloseTo(p, 6);
    e.setManual('16045-VBA-309712', true);
    e.avanzar(1);
    expect(s.piLectura).toBe(0);
  });
});
