import { useEngine } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { CONST_PLANTA } from '../../sim/process/plant';
import { phDesde, co2, type Calidad as Cal } from '../../sim/process/water';
import { TrendPane } from '../common/Trend';
import { fmt, LETRAS } from '../common/util';

interface Corriente {
  id: string;
  nombre: string;
  fluido: 'agua' | 'aire' | 'quimico';
  q: number;
  unidad: string;
  diam?: number;
  T?: number;
  P?: string;
  c?: Cal;
  pH?: number;
  nota?: string;
}

function viscosidadAgua(TC: number) {
  return 2.414e-5 * 10 ** (247.8 / (TC + 133.15)); // Pa·s
}

function hidraulica(s: Corriente) {
  if (!s.diam || s.q <= 0) return { v: NaN, re: NaN };
  const D = s.diam * 0.0254 * 0.95;
  const A = (Math.PI * D * D) / 4;
  if (s.fluido === 'agua') {
    const v = s.q / 3600 / A;
    return { v, re: (999.5 * v * D) / viscosidadAgua(s.T ?? 12) };
  }
  // aire: caudal real a condiciones del sitio
  const pAbs = CONST_PLANTA.P_ATM_KPA + (Number.parseFloat(s.P ?? '0') || 0);
  const Tk = (s.T ?? 10) + 273.15;
  const qReal = s.q * (101.325 / pAbs) * (Tk / 273.15);
  const v = qReal / 3600 / A;
  const rho = (pAbs * 1000) / (287.05 * Tk);
  return { v, re: (rho * v * D) / 1.85e-5 };
}

function corrientes(e: Engine): Corriente[] {
  const pl = e.planta;
  const p = e.params;
  const T = p.T_agua_C;
  const ph = (c: Cal) => phDesde(c.alk, c.ct, T);
  const fr = pl.frontera;
  const bwo = pl.filtros.reduce((s, f) => s + f.qBWO, 0);
  const turbBWO = bwo > 0 ? pl.filtros.reduce((s, f) => s + f.qBWO * f.turbBWO, 0) / bwo : 0;
  const rw = pl.filtros.reduce((s, f) => s + f.qRW, 0);
  const clRW = rw > 0 ? pl.filtros.reduce((s, f) => s + f.qRW * f.cl, 0) / rw : 0;
  const cBWO: Cal = { ...pl.c16, turb: turbBWO };
  const cRW: Cal = { ...pl.c15, cl: clRW };
  const cRI: Cal = { ...pl.c16, cl: pl.clRegen + (fr.qRegen > 0 ? (fr.naoclLh * 0.125 * 1e6) / (fr.qRegen * 1000) : 0) };
  const out: Corriente[] = [
    { id: 'RO', nombre: 'Permeado RO → TK-30015 (N3)', fluido: 'agua', q: pl.qRO, unidad: 'm³/h', diam: 30, T, c: pl.cEntrada, pH: p.pH_in, nota: 'calidad de mezcla de diseño' },
    { id: 'HDS', nombre: 'Agua tratada HDS → TK-30015 (N1)', fluido: 'agua', q: pl.qHDS, unidad: 'm³/h', diam: 12, T, c: pl.cEntrada, pH: p.pH_in, nota: 'calidad de mezcla de diseño' },
    { id: 'TKF', nombre: 'TK-30015 → colector de entrada (N6)', fluido: 'agua', q: pl.qAFiltros, unidad: 'm³/h', diam: 40, T, c: pl.c15, pH: pl.pH15 },
    { id: 'BYP', nombre: 'Bypass N12 → FV-603 → sumidero', fluido: 'agua', q: pl.qBypass, unidad: 'm³/h', diam: 24, T, P: '61.5', c: pl.c15, pH: pl.pH15 },
    ...pl.filtros.map((f, i): Corriente => ({ id: `F${i}`, nombre: `Filtrado ${LETRAS[i]} (SEVO)`, fluido: 'agua', q: f.qSEVO, unidad: 'm³/h', diam: 20, T, c: f.calidadSalida, pH: ph(f.calidadSalida) })),
    { id: 'FIL', nombre: 'Agua filtrada total → sumidero', fluido: 'agua', q: pl.qFiltrada, unidad: 'm³/h', diam: 40, T, c: pl.cFiltrada, pH: ph(pl.cFiltrada) },
    { id: 'SUM', nombre: 'Sumidero → TK-30016 (filtrada + bypass)', fluido: 'agua', q: pl.qSumidero, unidad: 'm³/h', T, c: pl.cSumidero, pH: ph(pl.cSumidero) },
    { id: 'BW', nombre: 'Retrolavado PU-30407/08 → BWI', fluido: 'agua', q: fr.qBW, unidad: 'm³/h', diam: 24, T, P: '200', c: pl.c16, pH: pl.pH16 },
    { id: 'BWO', nombre: 'Desecho de retrolavado BWO → TK-30039', fluido: 'agua', q: bwo, unidad: 'm³/h', diam: 24, T, c: cBWO, pH: pl.pH16 },
    { id: 'RI', nombre: 'Regeneración PU-30169/70 → RI (+ NaOCl)', fluido: 'agua', q: fr.qRegen, unidad: 'm³/h', diam: 6, T, P: '150', c: cRI },
    { id: 'RW', nombre: 'Enjuague / desecho regen. RO/RW → TK-30038', fluido: 'agua', q: rw, unidad: 'm³/h', diam: 18, T, c: cRW },
    { id: 'LIB', nombre: 'TK-30016 → liberación PU-30088/89', fluido: 'agua', q: fr.qLiberacion, unidad: 'm³/h', T, c: pl.c16, pH: pl.pH16 },
    { id: 'AC', nombre: 'Aire compresores → difusor DF-30003', fluido: 'aire', q: pl.qAireTK15, unidad: 'Nm³/h', diam: 4, T: Math.max(...pl.compresores.map((c) => c.tDescarga)), P: fmt(pl.pAireComp, 0) },
    { id: 'AS', nombre: 'Aire soplantes → AIRI (air scour)', fluido: 'aire', q: pl.qAireSoplado, unidad: 'Nm³/h', diam: 8, T: Math.max(...pl.soplantes.map((s) => s.tDescarga)), P: fmt(pl.pAireSoplado, 1) },
    { id: 'IA', nombre: 'Aire de instrumentos (por otros)', fluido: 'aire', q: pl.consumoAireInst, unidad: 'Nm³/h', P: fmt(pl.pAireInst, 0), nota: 'prom. 82 / pico 98 Nm³/h' },
    { id: 'H2SO4', nombre: `H₂SO₄ ${p.acido_conc_pct} % (TK-30015 + TK-30016)`, fluido: 'quimico', q: fr.acidoLh + fr.acido16Lh, unidad: 'L/h' },
    { id: 'NAOH', nombre: `NaOH ${p.soda_conc_pct} % (TK-30015)`, fluido: 'quimico', q: fr.sodaLh, unidad: 'L/h' },
    { id: 'NAOCL', nombre: 'NaOCl 12.5 % (paso 13)', fluido: 'quimico', q: fr.naoclLh, unidad: 'L/h' },
    { id: 'NAPTC', nombre: 'NaPTC (PK-30011)', fluido: 'quimico', q: pl.qEntrada > 0 ? p.naptc_Lh : 0, unidad: 'L/h' },
  ];
  return out;
}

export function Calidad() {
  const e = useEngine();
  const pl = e.planta;
  const p = e.params;
  const lista = corrientes(e);
  const remTurb = pl.c15.turb > 0 ? 100 * (1 - pl.cFiltrada.turb / pl.c15.turb) : NaN;
  const remMn = pl.c15.mn > 0 ? 100 * (1 - pl.cFiltrada.mn / pl.c15.mn) : NaN;
  const { co2: co2d, sat } = co2(pl.c15.alk, pl.c15.ct, p.T_agua_C, CONST_PLANTA.P_ATM_KPA / 100);
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Corrientes y calidad de agua</h2>
        <p>Tabla de corrientes al estilo PFD: caudal, velocidad y Reynolds en la cañería, presión, temperatura y concentraciones. pH calculado con el sistema carbonato a {p.T_agua_C} °C y {fmt(CONST_PLANTA.P_ATM_KPA, 1)} kPa(a).</p>
      </div>
      <div className="grid g4">
        <div className="card"><div className="lbl">Agua tratada por filtros</div><div className="mono" style={{ fontSize: '1.5rem', color: e.pctFiltrado < 87 ? 'var(--crit)' : undefined }}>{fmt(e.pctFiltrado, 1)} %</div><div className="dim">objetivo ≥ 87 %</div></div>
        <div className="card"><div className="lbl">Remoción de turbidez</div><div className="mono" style={{ fontSize: '1.5rem' }}>{fmt(remTurb, 1)} %</div><div className="dim">{fmt(pl.c15.turb, 2)} → {fmt(pl.cFiltrada.turb, 2)} NTU</div></div>
        <div className="card"><div className="lbl">Remoción de manganeso</div><div className="mono" style={{ fontSize: '1.5rem' }}>{fmt(remMn, 1)} %</div><div className="dim">{fmt(pl.c15.mn, 3)} → {fmt(pl.cFiltrada.mn, 3)} mg/L</div></div>
        <div className="card"><div className="lbl">CO₂ disuelto TK-30015</div><div className="mono" style={{ fontSize: '1.5rem' }}>{fmt(co2d * 44, 1)} mg/L</div><div className="dim">saturación {fmt(sat * 44, 2)} mg/L (stripping por aireación)</div></div>
      </div>

      <div className="card">
        <h3>Tabla de corrientes</h3>
        <div className="scroll-x">
          <table className="t">
            <thead>
              <tr>
                <th>Corriente</th><th className="n">Caudal</th><th>Unid.</th><th className="n">Ø in</th><th className="n">v m/s</th><th className="n">Re</th><th className="n">T °C</th><th className="n">P kPag</th>
                <th className="n">pH</th><th className="n">Cond. µS/cm</th><th className="n">Turb NTU</th><th className="n">Fe mg/L</th><th className="n">Mn mg/L</th><th className="n">Cl₂ mg/L</th><th className="n">SO₄ mg/L</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const h = hidraulica(s);
                const act = s.q > 0.05;
                return (
                  <tr key={s.id} style={{ opacity: act ? 1 : 0.55 }}>
                    <td>{s.nombre}{s.nota && <span className="dim" style={{ fontSize: '0.75rem' }}> · {s.nota}</span>}</td>
                    <td className="n">{fmt(s.q, s.unidad === 'L/h' ? 1 : 0)}</td>
                    <td>{s.unidad}</td>
                    <td className="n">{s.diam ?? ''}</td>
                    <td className="n">{act && s.diam ? fmt(h.v, 2) : ''}</td>
                    <td className="n">{act && Number.isFinite(h.re) ? h.re.toExponential(1) : ''}</td>
                    <td className="n">{s.T !== undefined ? fmt(s.T, 0) : ''}</td>
                    <td className="n">{s.P ?? ''}</td>
                    <td className="n">{s.pH !== undefined ? fmt(s.pH, 2) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.cond, 0) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.turb, s.c.turb > 20 ? 0 : 2) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.fe, 3) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.mn, 3) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.cl, s.c.cl > 10 ? 0 : 2) : ''}</td>
                    <td className="n">{s.c ? fmt(s.c.so4, 0) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="note" style={{ marginTop: 6 }}>Ø interno ≈ 0.95 × nominal. Aire a condiciones reales del sitio (presión atmosférica {fmt(CONST_PLANTA.P_ATM_KPA, 1)} kPa(a)). Las corrientes en gris no circulan ahora.</div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Química TK-30015 (modelo)</h3>
          <dl className="kv">
            <dt>Alcalinidad entrada → TK</dt><dd>{fmt(pl.cEntrada.alk * 50, 1)} → {fmt(pl.c15.alk * 50, 1)} mg/L CaCO₃</dd>
            <dt>Carbono inorgánico total</dt><dd>{fmt(pl.c15.ct, 3)} mmol/L</dd>
            <dt>pH entrada → TK (SP por otros {p.pH_SP_TK15})</dt><dd>{fmt(p.pH_in, 2)} → {fmt(pl.pH15, 2)}</dd>
            <dt>Conductividad</dt><dd>{fmt(pl.c15.cond, 0)} µS/cm</dd>
            <dt>SiO₂</dt><dd>{fmt(pl.c15.sio2, 0)} mg/L</dd>
            <dt>Consumo H₂SO₄ / NaOH / NaOCl / NaPTC</dt><dd>{fmt(pl.tot.acidoL, 0)} / {fmt(pl.tot.sodaL, 0)} / {fmt(pl.tot.naoclL, 0)} / {fmt(pl.tot.naptcL, 0)} L</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Totalizadores</h3>
          <dl className="kv">
            <dt>Entrada TK-30015</dt><dd>{fmt(pl.tot.entrada, 0)} m³</dd>
            <dt>Filtrada</dt><dd>{fmt(pl.tot.filtrada, 0)} m³</dd>
            <dt>Bypass</dt><dd>{fmt(pl.tot.bypass, 0)} m³</dd>
            <dt>Retrolavado</dt><dd>{fmt(pl.tot.retrolavado, 0)} m³</dd>
            <dt>Enjuague / regeneración a sumidero</dt><dd>{fmt(pl.tot.regenRW, 0)} m³</dd>
            <dt>Rebalse TK-30015</dt><dd>{fmt(pl.tot.rebalse15, 0)} m³</dd>
            <dt>Aire de lavado</dt><dd>{fmt(pl.tot.aireSopladoNm3, 0)} Nm³</dd>
          </dl>
        </div>
      </div>
      <div className="grid g2">
        <div className="card"><TrendPane series={['AIT-160305600']} ventana={4 * 3600} titulo="pH TK-30015" refs={[{ v: 7.0, label: 'HH 7.0' }, { v: 6.0, label: 'LL 6.0' }]} /></div>
        <div className="card"><TrendPane series={['TURB-FILTRADA', 'TURB-TK16']} ventana={4 * 3600} titulo="Turbidez" /></div>
        <div className="card"><TrendPane series={['MN-FILTRADA']} ventana={4 * 3600} titulo="Manganeso en agua filtrada" /></div>
        <div className="card"><TrendPane series={['CL-A', 'CL-B', 'CL-C', 'CL-D']} ventana={4 * 3600} titulo="Cloro libre en filtros" /></div>
      </div>
    </div>
  );
}
