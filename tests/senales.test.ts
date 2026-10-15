// Panel de señales (senales_por_equipo.json): cobertura contra la tabla de I/O del simulador.
import { describe, expect, test } from 'vitest';
import { senalesDe, senalesPorEquipo, filtrosEquipo } from '../src/data';
import { Engine } from '../src/sim/engine';

describe('Señales por equipo', () => {
  test('cada filtro lista 22 señales: LIT + 7 válvulas × 3', () => {
    for (const f of filtrosEquipo) expect(senalesDe(f.tag)).toHaveLength(22);
  });

  test('toda señal AI/AO/DI/DO/DI(com) del mapa existe en la tabla de I/O (valor en vivo)', () => {
    const e = new Engine('normal');
    const faltan = Object.values(senalesPorEquipo.mapa)
      .flat()
      .filter((s) => ['AI', 'AO', 'DI', 'DO', 'DI(com)'].includes(s.tipo) && !e.io.tiene(s.tag_io))
      .map((s) => s.tag_io);
    expect([...new Set(faltan)]).toEqual([]);
  });

  test('nombres lógicos en la tabla de I/O: HY/ZSO/ZSC documentados y señales de motor propuestas', () => {
    const e = new Engine('normal');
    expect(e.io.punto('HV-160305608').nombreLogico).toBe('HY-160305608');
    expect(e.io.punto('HV-160305608-ZSO').nombreLogico).toBe('ZSO-160305608');
    const m = e.io.punto('16045-CM-30011-RUN');
    expect(m.nombreLogico).toBe('16045-CM-30011-M.RUN');
    expect(m.propuesto).toBe(true);
  });
});
