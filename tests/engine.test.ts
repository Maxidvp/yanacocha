// Pruebas de integración: proceso + I/O + PLC.
import { describe, expect, test } from 'vitest';
import { Engine } from '../src/sim/engine';

describe('Integración', () => {
  test('régimen normal: TK-30015, pH y filtros estables sin alarmas', () => {
    const e = new Engine('normal');
    e.avanzar(1800);
    expect(e.planta.L15).toBeGreaterThan(5300);
    expect(e.planta.L15).toBeLessThan(5760);
    expect(e.planta.pH15).toBeCloseTo(6.5, 1);
    expect(e.planta.qFiltrada).toBeCloseTo(1472, -1);
    expect(e.plc.alarmas.resumen.filter((a) => a.activa)).toHaveLength(0);
  });

  test('lavado + regeneración del filtro A completo sin HOLD y vuelta a servicio', { timeout: 60000 }, () => {
    const e = new Engine('lavado');
    const s = e.plc.filtros[0];
    const pasos = new Set<number>();
    for (let k = 0; k < 2400 && !(pasos.has(16) && s.paso === 3); k++) {
      e.avanzar(5);
      pasos.add(s.paso);
      expect(s.hold, s.holdCausa ?? '').toBe(false);
      if (s.paso === 15 && s.esperandoStepAdvance && e.tomarMuestra(0).cl < 0.2) e.cmd({ tipo: 'filtro', filtro: 0, boton: 'STEP_ADVANCE' });
    }
    expect([...pasos].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].filter((x) => pasos.has(x)));
    for (const x of [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) expect(pasos.has(x), `paso ${x}`).toBe(true);
    expect(s.paso).toBe(3);
    expect(s.regeneraciones).toBe(1);
    expect(e.planta.filtros[0].suciedad).toBeLessThan(5);
  });

  test('LAL-160305601 dispara AG-30006 (E3) enclavado hasta reset', () => {
    const e = new Engine('normal');
    e.setParam('q_RO_m3h', 0);
    e.setParam('q_HDS_m3h', 0);
    e.setManual('16045-VBF-309703', true); // drenaje del TK
    e.cmd({ tipo: 'fic', modo: 'MANUAL', salida: 100 });
    e.avanzar(900);
    expect(e.plc.disparo('E3')).toBe(true);
    expect(e.planta.motor('16045-AG-30006').contactor).toBe(false);
    // recuperar nivel: el disparo sigue hasta el reset del operador
    e.setManual('16045-VBF-309703', false);
    e.cmd({ tipo: 'fic', modo: 'PROGRAMA' });
    e.setParam('q_RO_m3h', 1030);
    e.setParam('q_HDS_m3h', 442);
    e.avanzar(1200);
    expect(e.plc.disparo('E3')).toBe(true);
    e.cmd({ tipo: 'reset_disparos' });
    e.avanzar(1);
    expect(e.plc.disparo('E3')).toBe(false);
  });

  test('falla al arrancar (FTS) del compresor duty → arranca el standby', () => {
    const e = new Engine('normal');
    e.setMotorFalla('16045-CM-30011', 'falla', true);
    e.avanzar(30);
    expect(e.plc.alarmas.activa('16045-CM-30011-FLT')).toBe(true);
    expect(e.planta.motor('16045-CM-30012').contactor).toBe(true);
  });

  test('dos compresores en marcha → FAHH-160305602 → disparo E13 de ambos', () => {
    const e = new Engine('normal');
    e.cmd({ tipo: 'motor', tag: '16045-CM-30012', accion: 'MANUAL' });
    e.cmd({ tipo: 'motor', tag: '16045-CM-30012', accion: 'START' });
    e.avanzar(60);
    expect(e.plc.disparo('E13')).toBe(true);
    expect(e.planta.motor('16045-CM-30011').contactor).toBe(false);
    expect(e.planta.motor('16045-CM-30012').contactor).toBe(false);
  });

  test('pérdida de aire de instrumentos: FV-603 cierra (resorte) y on/off quedan en última posición', () => {
    const e = new Engine('diseno');
    e.avanzar(300);
    expect(e.planta.fv603.pos).toBeGreaterThan(0.2);
    const sevi = e.planta.filtros[1].valvulas.SEVI.pos;
    e.setFallaGlobal('aireInstrumentos', true);
    e.avanzar(300);
    expect(e.planta.fv603.pos).toBeLessThan(0.01);
    expect(e.planta.filtros[1].valvulas.SEVI.pos).toBe(sevi);
  });

  test('pérdida de 24 VDC: AI a 0 mA (falla de lazo) y solenoides desenergizados', () => {
    const e = new Engine('normal');
    e.setFallaGlobal('dc24', true);
    e.avanzar(30);
    expect(e.io.punto('LIT-160305604').origen).toBe(0);
    expect(e.plc.alarmas.activa('LIT-160305604-BAD')).toBe(true);
    // solenoides desenergizados → las válvulas Tipo V5 (con aire) cierran
    expect(e.planta.filtros[0].valvulas.SEVI.pos).toBe(0);
  });

  test('lavado_por_LAH: el filtro pide lavado al superar 1613 mm (LAH) sin llegar a LAHH', () => {
    const e = new Engine('normal');
    e.setParam('lavado_por_LAH', 1);
    e.io.forzar('LIT-160305604', 4 + (16 * 1700) / 2980);
    e.avanzar(10);
    expect(e.plc.filtros[0].paso).toBeGreaterThanOrEqual(4);
    expect(e.plc.filtros[0].ultimoMotivoLavado).toMatch(/^LAH /);
  });

  test('forzado de una entrada: el PLC ve el valor forzado', () => {
    const e = new Engine('normal');
    e.io.forzar('LIT-160305604', 4 + (16 * 1800) / 2980);
    e.avanzar(10);
    expect(e.plc.pv['LIT-160305604'].eu).toBeCloseTo(1800, 0);
    // LAHH → Backwashing Required (y luego avanza al lavado si hay permisivo)
    expect(e.plc.filtros[0].paso).toBeGreaterThanOrEqual(4);
    expect(e.plc.filtros[0].ultimoMotivoLavado).toMatch(/LAHH/);
  });
});
