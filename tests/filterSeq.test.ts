import { describe, expect, test } from 'vitest';
import { proceso, soe, causaEfecto, COLUMNA_SECUENCIA, FUNCIONES_VALVULA } from '../src/data';
import { defaultParams } from '../src/sim/params';
import { SecuenciaFiltro, matrizPaso, type CtxFiltro, type Valvulas } from '../src/sim/plc/filterSeq';

const p = defaultParams();
const z0 = p.z0_LIT_mm;

/** Banco de prueba: válvulas ideales (finales de carrera siguen al comando en el scan siguiente). */
function banco(paso = 3) {
  const f = new SecuenciaFiltro(0, '16045-FL-30035');
  f.paso = paso;
  f.modo = 'AUTO';
  const otros = [1, 2, 3].map((i) => {
    const o = new SecuenciaFiltro(i, `F${i}`);
    o.paso = 3;
    o.modo = 'AUTO';
    return o;
  });
  const estado = { lit: 1200, lahh: false, sopl: true, bwAvl: true, regenAvl: true, sumidero: 80, disc: null as string | null };
  let pos: Valvulas = matrizPaso(paso);
  const ctx = (dt: number): CtxFiltro => ({
    dt, p, litEU: estado.lit, litMala: false, lahh: estado.lahh, lal: false,
    zso: { ...pos }, zsc: Object.fromEntries(FUNCIONES_VALVULA.map((k) => [k, !pos[k]])) as Valvulas,
    discrepancia: estado.disc, todos: [f, ...otros], soplanteDisponible: estado.sopl, soplanteEnMarcha: false,
    bombaBWDisponible: estado.bwAvl, bombaBWEnMarcha: false, caudalBWAlarma: false, bombaRegenDisponible: estado.regenAvl,
    bombaRegenEnMarcha: true, nivelSumideroRegen: estado.sumidero, tk15Bajo: false,
  });
  const correr = (seg: number, dt = 0.5) => {
    for (let t = 0; t < seg; t += dt) {
      f.scan(ctx(dt));
      for (const o of otros) o.scan(ctx(dt));
      pos = { ...f.salida.valvulas };
    }
  };
  return { f, otros, estado, correr };
}

describe('Matriz de válvulas de la secuencia', () => {
  test('matrizPaso reproduce proceso_y_logica.json para los 17 pasos', () => {
    expect(proceso.filtros.secuencia).toHaveLength(17);
    for (const s of proceso.filtros.secuencia) {
      const m = matrizPaso(s.paso);
      for (const fn of FUNCIONES_VALVULA) expect(m[fn], `paso ${s.paso} ${fn}`).toBe(s.valvulas[COLUMNA_SECUENCIA[fn]] === 'O');
    }
  });
});

describe('Consistencia entre documentos', () => {
  test('la SOE de la C&E rev002 tiene la misma matriz de válvulas que la filosofía rev005', () => {
    expect(soe.pasos).toHaveLength(17);
    for (const s of soe.pasos) {
      const m = matrizPaso(s.paso);
      for (const fn of FUNCIONES_VALVULA) expect(s.valvulas[COLUMNA_SECUENCIA[fn]] === 'O', `paso ${s.paso} ${fn}`).toBe(m[fn]);
    }
    expect(Object.values(soe.hold.valvulas).every((v) => v === 'Cl')).toBe(true);
  });

  test('presets: solo T13 y T14 difieren entre SOE y filosofía', () => {
    const p = defaultParams();
    const filo: Record<number, number> = { 3: p.T03_servicio_desde_ultimo_lavado_min * 60, 6: p.T06_s, 7: p.T07_s, 8: p.T08_s, 9: p.T09_s, 10: p.T10_s, 11: p.T11_s, 12: p.T12_s, 13: p.T13_s, 14: p.T14_s, 15: p.T15_s, 16: p.T16_s };
    const difieren = soe.pasos.filter((s) => s.preset_s !== null && filo[s.paso] !== s.preset_s).map((s) => s.paso);
    expect(difieren).toEqual([13, 14]);
  });

  test('equipos comunes de la SOE coinciden con los pedidos de la secuencia', () => {
    const fila = (n: number) => soe.pasos.find((s) => s.paso === n)!.comunes;
    expect(fila(7).soplantes).toBe('ST');
    expect(fila(8).drenaje_soplantes).toBe('O');
    expect(fila(10).bombas_retrolavado).toBe('ON');
    expect([fila(12).bombas_regeneracion, fila(13).bombas_regeneracion]).toEqual(['ON', 'ON']);
    expect(fila(13).bombas_naocl).toBe('ON');
    for (const s of soe.pasos.filter((x) => x.paso >= 5 && x.paso !== 8)) expect(s.comunes.drenaje_soplantes).toBe('Cl');
  });

  test('matriz causa-efecto: 15 causas, 13 efectos, disparos T y acciones X', () => {
    expect(causaEfecto.causas).toHaveLength(15);
    expect(Object.keys(causaEfecto.efectos_detalle)).toHaveLength(13);
    const x = causaEfecto.causas.filter((c) => Object.values(c.efectos).includes('X')).map((c) => c.linea);
    expect(x).toEqual([10, 11, 12, 13]);
  });
});

describe('Secuencia de filtro – recorrido completo de los 17 pasos', () => {
  test('recorre 0→16 con las transiciones y la matriz documentadas', () => {
    const { f, estado, correr } = banco(1);
    f.paso = 0;
    f.modo = 'SEMIAUTO';
    const vistos: number[] = [];
    const verificarMatriz = () => {
      // en régimen del paso, los comandos deben coincidir con la matriz documentada
      expect(f.salida.valvulas, `matriz paso ${f.paso}`).toEqual(matrizPaso(f.paso));
      vistos.push(f.paso);
    };

    correr(1);
    verificarMatriz(); // 0 OFFLINE
    f.boton('STANDBY');
    correr(1);
    expect(f.paso).toBe(1);
    verificarMatriz();
    f.boton('SERVICE');
    correr(0.5);
    expect(f.paso).toBe(2);
    verificarMatriz(); // 2: todas cerradas → pasa a 3 con ZSC
    correr(1);
    expect(f.paso).toBe(3);
    correr(5);
    verificarMatriz();
    // operador pide regeneración en Semiauto → 4 con regen requerida
    f.boton('REGENERATION');
    correr(0.5);
    expect(f.paso).toBe(4);
    expect(f.regenRequerida).toBe(true);
    verificarMatriz();
    // otros 3 filtros en servicio, ninguno en standby/lavado → 5 → 6 (una transición por scan)
    correr(0.5);
    expect(f.paso).toBe(5);
    verificarMatriz();
    correr(0.5);
    expect(f.paso).toBe(6);
    correr(2);
    verificarMatriz(); // 6 DRAIN DOWN: SEVO abierta
    estado.lit = p.K06_mm - z0 - 1;
    correr(0.5);
    expect(f.paso).toBe(7);
    correr(2);
    verificarMatriz(); // 7 AIR SCOUR
    expect(f.salida.pideSoplante).toBe(true);
    correr(p.T07_s);
    expect(f.paso).toBe(8);
    verificarMatriz();
    expect(f.salida.pide639).toBe(true);
    correr(p.T08_s);
    expect(f.paso).toBe(9);
    verificarMatriz();
    estado.lit = p.K09_mm - z0 + 1;
    correr(0.5);
    expect(f.paso).toBe(10);
    // paso 10: espera 10 s con todo cerrado, luego BWI/BWO y bomba
    correr(5);
    expect(f.salida.valvulas.BWI).toBe(false);
    correr(p.espera_valvulas_s);
    verificarMatriz();
    correr(1);
    expect(f.salida.pideBW).toBe(true);
    correr(p.T10_s);
    expect(f.paso).toBe(11);
    expect(f.salida.pideBW).toBe(false);
    correr(p.espera_valvulas_s + 1);
    verificarMatriz();
    correr(p.T11_s);
    expect(f.paso).toBe(12); // regeneración requerida
    correr(2);
    verificarMatriz();
    expect(f.salida.pideRegen).toBe(true);
    correr(p.T12_s);
    expect(f.paso).toBe(13);
    verificarMatriz();
    expect(f.salida.pideNaOCl).toBe(true);
    correr(p.T13_s);
    expect(f.paso).toBe(14);
    expect(f.salida.pideRegen).toBe(false);
    correr(p.espera_valvulas_s + 1);
    verificarMatriz();
    correr(p.T14_s);
    expect(f.paso).toBe(15);
    verificarMatriz();
    // T15 cumplido: espera Step Advance del operador
    correr(p.T15_s + 30);
    expect(f.paso).toBe(15);
    expect(f.esperandoStepAdvance).toBe(true);
    f.boton('STEP_ADVANCE');
    correr(0.5);
    expect(f.paso).toBe(16);
    verificarMatriz();
    correr(p.T16_s + 1);
    // Semiauto → vuelve a Standby; contadores reseteados
    expect(f.paso).toBe(1);
    expect(f.tServicioLavado).toBe(0);
    expect(f.tServicioRegen).toBe(0);
    expect(f.regenRequerida).toBe(false);
    expect(f.lavados).toBe(1);
    expect(f.regeneraciones).toBe(1);
    expect(new Set(vistos)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
  });

  test('sin regeneración requerida, el paso 11 va directo a 15 (fast rinse)', () => {
    const { f, estado, correr } = banco(3);
    f.tServicioLavado = p.T03_servicio_desde_ultimo_lavado_min * 60;
    correr(2);
    expect(f.paso).toBe(6);
    estado.lit = 300;
    correr(1);
    correr(p.T07_s + p.T08_s + 1);
    estado.lit = 1700;
    correr(1 + p.T10_s + p.T11_s + 2);
    expect(f.paso).toBe(15);
  });

  test('con lavado_por_LAH el motivo registra LAH (interpretación de la C&E)', () => {
    const { f, estado, correr } = banco(3);
    const q = { ...p, lavado_por_LAH: 1 };
    Object.assign(p, q);
    estado.lahh = true;
    correr(0.5);
    expect(f.ultimoMotivoLavado).toMatch(/^LAH /);
    Object.assign(p, { lavado_por_LAH: 0 });
  });

  test('LAHH en servicio pasa a Backwashing Required; K03 marca regeneración', () => {
    const { f, estado, correr } = banco(3);
    f.tServicioRegen = p.K03_servicio_desde_ultima_regen_min * 60;
    estado.lahh = true;
    correr(0.5);
    expect(f.paso).toBe(4);
    expect(f.ultimoMotivoLavado).toMatch(/LAHH/);
    expect(f.regenRequerida).toBe(false);
    correr(0.5);
    expect(f.regenRequerida).toBe(true);
  });

  test('T06 vencido sin alcanzar K06 → HOLD; Resume conserva el tiempo; Hold+Offline aborta', () => {
    const { f, estado, correr } = banco(6);
    estado.lit = 1500;
    correr(p.T06_s + 1);
    expect(f.hold).toBe(true);
    expect(f.holdCausa).toMatch(/T06/);
    expect(f.salida.valvulas).toEqual(matrizPaso(0)); // HOLD: 7 válvulas cerradas
    const tAntes = f.tPaso;
    correr(60);
    expect(f.tPaso).toBe(tAntes); // el timer no corre en HOLD
    f.boton('RESUME');
    correr(0.5);
    expect(f.hold).toBe(true); // vuelve a vencer de inmediato porque el tiempo se conserva
    f.boton('OFFLINE');
    correr(0.5);
    expect(f.paso).toBe(0);
    expect(f.hold).toBe(false);
  });

  test('Paso 7 sin soplantes disponibles → HOLD; Resume exige soplante en Auto', () => {
    const { f, estado, correr } = banco(7);
    estado.sopl = false;
    correr(0.5);
    expect(f.hold).toBe(true);
    f.boton('RESUME');
    correr(0.5);
    expect(f.hold).toBe(true);
    estado.sopl = true;
    f.boton('RESUME');
    correr(0.5);
    expect(f.hold).toBe(false);
    expect(f.paso).toBe(7);
  });

  test('Paso 10 sin bombas de retrolavado → HOLD', () => {
    const { f, estado, correr } = banco(10);
    estado.bwAvl = false;
    correr(0.5);
    expect(f.hold).toBe(true);
    expect(f.holdCausa).toMatch(/retrolavado/);
  });

  test('ZAO/ZAC de una válvula del filtro → HOLD por dispositivo', () => {
    const { f, estado, correr } = banco(3);
    estado.disc = 'HV-160305608 ZAC';
    correr(0.5);
    expect(f.hold).toBe(true);
    expect(f.holdCausa).toMatch(/HV-160305608/);
  });

  test('Prolong retiene el paso temporizado hasta Step Advance', () => {
    const { f, correr } = banco(8);
    f.prolongar = true;
    correr(p.T08_s + 30);
    expect(f.paso).toBe(8);
    f.boton('STEP_ADVANCE');
    correr(0.5);
    expect(f.paso).toBe(9);
  });

  test('Permisivo: solo un filtro fuera de servicio a la vez', () => {
    const { f, otros, correr } = banco(4);
    otros[0].paso = 8; // otro filtro lavando
    correr(5);
    expect(f.paso).toBe(4);
    otros[0].paso = 3;
    correr(1);
    expect(f.paso).toBe(6);
  });

  test('Prioridad: entre filtros en paso 4, primero el de mayor tiempo de servicio', () => {
    const { f, otros, correr } = banco(4);
    f.tServicioLavado = 1000;
    otros[1].paso = 4;
    otros[1].tServicioLavado = 5000;
    correr(0.5);
    expect(f.paso).toBe(4);
  });
});
