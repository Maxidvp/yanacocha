// Correcciones de la revisión del sitio (CLAUDE.md v3 – 14-oct).
import { describe, expect, test } from 'vitest';
import { Engine } from '../src/sim/engine';

describe('Revisión del sitio', () => {
  test('lavado completo: sin ZAO/ZAC falsas (retardo ≥ carrera + margen) y balance de agua cerrado', { timeout: 60000 }, () => {
    const e = new Engine('lavado');
    const s = e.plc.filtros[0];
    const falsas = new Set<string>();
    let cierreMax = 0;
    let vistoPaso15 = false;
    for (let k = 0; k < 2400 && !(vistoPaso15 && s.paso === 3); k++) {
      e.avanzar(5);
      for (const a of e.plc.alarmas.resumen) if (a.activa && /^ZA[OC]-/.test(a.def.id)) falsas.add(a.def.id);
      cierreMax = Math.max(cierreMax, Math.abs(e.planta.balance.cierre));
      if (s.paso === 15) {
        vistoPaso15 = true;
        if (s.esperandoStepAdvance) e.cmd({ tipo: 'filtro', filtro: 0, boton: 'STEP_ADVANCE' });
      }
    }
    expect(s.paso).toBe(3);
    expect([...falsas]).toEqual([]);
    expect(cierreMax).toBeLessThan(1);
  });

  test('carrera de válvulas = DN × s/in y retardo efectivo ZAO/ZAC = máx(alarm list, carrera + margen)', () => {
    const e = new Engine('normal');
    e.avanzar(1);
    const bwo = e.plc.valvulas.get('HV-160305610')!; // 24″
    const hv639 = e.plc.valvulas.get('HV-160305639')!; // sin DN en la lista → 2″, alarm list 10 s
    expect(bwo.retardo).toBe(24 * e.params.carrera_s_por_pulg + e.params.margen_discrepancia_s);
    expect(hv639.retardo).toBe(10);
  });

  test('TT-160305703 dentro de 86–131 °C (hoja de datos) entre los extremos de temperatura ambiente', { timeout: 30000 }, () => {
    for (const [ta, lo, hi] of [[-9.4, 80, 90], [26.3, 127, 134]] as const) {
      const e = new Engine('normal');
      e.setParam('T_amb_C', ta);
      e.avanzar(1800);
      const td = e.planta.compresores[0].tDescarga;
      expect(td).toBeGreaterThan(lo);
      expect(td).toBeLessThan(hi);
    }
  });

  test('calidad por corriente: el permeado RO no es la mezcla; con caudales de diseño la mezcla es la documentada', () => {
    const e = new Engine('normal');
    e.avanzar(10);
    const p = e.params;
    expect(e.planta.cRO.cond).toBe(p.cond_RO);
    expect(e.planta.cRO.turb).toBe(p.turb_RO);
    expect(e.planta.cHDS.cond).toBeGreaterThan(p.cond_in);
    expect(e.planta.cEntrada.cond).toBeCloseTo(p.cond_in, 6);
    expect(e.planta.cEntrada.turb).toBeCloseTo(p.turb_in, 6);
    // menos HDS → mezcla más diluida
    e.setParam('q_HDS_m3h', 200);
    e.avanzar(1);
    expect(e.planta.cEntrada.cond).toBeLessThan(p.cond_in);
  });

  test('cero del LIT en el tope del medio: K06 → LIT ≈ −5 mm y K09 → LIT 1170 mm', () => {
    const e = new Engine('normal');
    const p = e.params;
    expect(p.z0_LIT_mm).toBe(1830);
    expect(p.K06_mm - p.z0_LIT_mm).toBe(-5);
    expect(p.K09_mm - p.z0_LIT_mm).toBe(1170);
  });

  test('timer del paso 3 (Service) = T03, tiempo de servicio desde el último lavado', () => {
    const e = new Engine('normal');
    e.avanzar(60);
    const s = e.plc.filtros[1];
    expect(s.paso).toBe(3);
    expect(s.timerPaso).toBe(s.tServicioLavado);
    expect(s.timerPaso).toBeGreaterThan(3600);
  });

  test('arranque DOL de soplantes: ≈ 6 × FLA (1350 A) en la barra durante la aceleración', () => {
    const e = new Engine('normal');
    e.avanzar(10);
    e.cmd({ tipo: 'motor', tag: '16045-BL-30008', accion: 'MANUAL' });
    e.cmd({ tipo: 'motor', tag: '16045-BL-30008', accion: 'START' });
    let max = 0;
    for (let k = 0; k < 30; k++) {
      e.avanzar(0.5);
      max = Math.max(max, e.planta.motor('16045-BL-30008').corriente);
    }
    expect(max).toBeCloseTo(1350, -1);
    expect(e.planta.I460).toBeLessThan(400); // ya en régimen
  });
});
