import { filtrosEquipo, proceso, soe, COLUMNA_SECUENCIA, FUNCIONES_VALVULA, type FuncionValvula } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { CONST_PLANTA } from '../../sim/process/plant';
import { SECUENCIA, type BotonFiltro } from '../../sim/plc/filterSeq';
import { Inst } from './Resumen';
import { Pipe, ValvulaSym } from '../common/symbols';
import { TrendPane } from '../common/Trend';
import { duracion, estadoValvula, fmt, LETRAS, tiempoSim } from '../common/util';

const NOMBRE_FN: Record<FuncionValvula, string> = { SEVI: 'Entrada de servicio', RI: 'Entrada regeneración', BWO: 'Salida retrolavado', FRO: 'Salida enjuague/regen. (RO/RW)', BWI: 'Entrada retrolavado', SEVO: 'Salida de servicio', AIRI: 'Entrada aire (air scour)' };

function Corte({ e, i }: { e: Engine; i: number }) {
  const f = e.planta.filtros[i];
  const fe = filtrosEquipo[i];
  const p = e.params;
  const X0 = 140;
  const W = 240;
  const Y0 = 60;
  const H = 300;
  const k = H / CONST_PLANTA.ALTO_FILTRO_MM;
  const y = (mmFondo: number) => Y0 + H - mmFondo * k;
  const v = (fn: FuncionValvula) => fe.valvulas[fn];
  const est = (fn: FuncionValvula) => estadoValvula(e, v(fn));
  const medios = fe.medios; // antracita, greensand, grava (de arriba hacia abajo en el JSON)
  const grava = medios[2].espesor_m * 1000;
  const gs = medios[1].espesor_m * 1000;
  const an = medios[0].espesor_m * 1000;
  const lin = (mm: number, txt: string, color = 'var(--ink-3)', izq = false) => (
    <g>
      <line x1={X0} x2={X0 + W} y1={y(mm)} y2={y(mm)} stroke={color} strokeDasharray="5 4" strokeWidth={1} />
      {txt && <text className="t-xs" x={izq ? X0 - 5 : X0 + W + 5} y={y(mm) + 4} textAnchor={izq ? 'end' : 'start'} style={{ fill: color }}>{txt}</text>}
    </g>
  );
  const z0 = p.z0_LIT_mm;
  const sucio = Math.min(1, f.suciedad / 120);
  return (
    <svg className="mimic" viewBox="0 0 560 430" role="img" aria-label={`Corte del filtro ${LETRAS[i]}`}>
      {/* agua */}
      <rect x={X0} y={y(Math.min(f.h, CONST_PLANTA.ALTO_FILTRO_MM))} width={W} height={Math.max(0, Math.min(f.h, CONST_PLANTA.ALTO_FILTRO_MM)) * k} fill={f.turbBWO > 20 ? 'var(--water-dirty)' : 'var(--water-fill)'} />
      {/* medios */}
      <rect x={X0} y={y(grava)} width={W} height={grava * k} fill="#8b8579" />
      <rect x={X0} y={y(grava + gs)} width={W} height={gs * k} fill="#3f5a3c" />
      <rect x={X0} y={y(grava + gs + an)} width={W} height={an * k} fill="#2f2f2f" />
      <rect x={X0} y={y(grava + gs + an)} width={W} height={Math.max(2, 10 * sucio)} fill="#7a6232" opacity={0.85} />
      <text className="t-xs" x={X0 + 6} y={y(grava + gs + an) + an * k - 3} style={{ fill: '#e0e0e0' }}>Antracita {an} mm</text>
      <text className="t-xs" x={X0 + 6} y={y(grava + gs) + gs * k / 2 + 3} style={{ fill: '#e0e0e0' }}>Greensand {gs} mm</text>
      <text className="t-xs" x={X0 + 6} y={y(grava) + grava * k / 2 + 3} style={{ fill: '#1b1b1b' }}>Grava {grava} mm</text>
      {f.qAire > 100 && (
        <g className="bubbles">
          {Array.from({ length: 14 }, (_, n) => <circle key={n} cx={X0 + 12 + n * 16} cy={y(grava + gs + an) - 4} r={2.6} style={{ animationDelay: `${(n % 7) * 0.2}s` }} />)}
        </g>
      )}
      <path d={`M ${X0} ${Y0} V ${Y0 + H} H ${X0 + W} V ${Y0}`} className="tank-wall" />
      {/* referencias de nivel (escala del LIT = fondo − z0) */}
      {lin(z0 + 1763, 'HH/H 1763/1613')}
      {lin(z0 + 1613, '')}
      {lin(z0 + 280, 'L/LL 280/140')}
      {lin(z0 + 140, '')}
      {lin(p.K06_mm, `K06 ${p.K06_mm}`, 'var(--accent)', true)}
      {lin(p.K09_mm, `K09 ${p.K09_mm}`, 'var(--accent)', true)}
      {lin(z0, `cero LIT ${z0}`, 'var(--ink-2)', true)}
      <text className="t-xs" x={X0} y={Y0 + H + 16}>Fondo · alto 4938 mm · área 39.04 m² · niveles en mm</text>

      {/* cañerías y válvulas */}
      <Pipe d={`M 10 40 H ${X0 + 40} V ${Y0}`} fluido="water" activa={f.qSEVI > 1} ancho={5} />
      <Pipe d="M 10 16 H 110 V 40" fluido="regen" activa={f.qRI > 1} ancho={3} />
      <Pipe d={`M 250 4 V ${y(150)}`} fluido="air" activa={f.qAire > 50} ancho={3} />
      <Pipe d={`M ${X0 + W} 70 H 550`} fluido="waste" activa={f.qBWO > 1} ancho={5} />
      <Pipe d={`M 10 ${y(110)} H ${X0}`} fluido="water" activa={f.qBWI > 1} ancho={4.5} />
      <Pipe d={`M ${X0 + W} ${y(110)} H 550`} fluido="water" activa={f.qSEVO > 1} ancho={5} />
      <Pipe d={`M 405 ${y(110)} V 400 H 550`} fluido="regen" activa={f.qRW > 1} ancho={4} />
      <ValvulaSym x={42} y={40} tag={v('SEVI')} estado={est('SEVI')} etiqueta="SEVI" size={10} />
      <ValvulaSym x={84} y={16} tag={v('RI')} estado={est('RI')} etiqueta="RI" size={8} />
      <ValvulaSym x={250} y={30} tag={v('AIRI')} estado={est('AIRI')} orient="v" etiqueta="AIRI" size={9} />
      <ValvulaSym x={470} y={70} tag={v('BWO')} estado={est('BWO')} etiqueta="BWO" size={10} />
      <ValvulaSym x={70} y={y(110)} tag={v('BWI')} estado={est('BWI')} etiqueta="BWI" size={10} />
      <ValvulaSym x={470} y={y(110)} tag={v('SEVO')} estado={est('SEVO')} etiqueta="SEVO" size={10} />
      <ValvulaSym x={470} y={400} tag={v('FRO')} estado={est('FRO')} etiqueta="RO/RW" size={9} />
      <Inst e={e} tag={fe.transmisor_nivel} x={330} y={30} />
      <text className="t-val" x={62} y={56}>{fmt(f.qSEVI, 0)}</text>
      <text className="t-val" x={490} y={63}>{fmt(f.qBWO, 0)}</text>
      <text className="t-val" x={12} y={y(110) - 8}>{fmt(f.qBWI, 0)}</text>
      <text className="t-val" x={490} y={y(110) - 8}>{fmt(f.qSEVO, 0)}</text>
      <text className="t-val" x={490} y={393}>{fmt(f.qRW, 0)}</text>
      <text className="t-xs" x={300} y={8}>{f.qAire > 1 ? `${fmt(f.qAire, 0)} Nm³/h` : ''}</text>
    </svg>
  );
}

function Botones({ e, i }: { e: Engine; i: number }) {
  const cmd = useSim((s) => s.cmd);
  const s = e.plc.filtros[i];
  const semi = s.modo === 'SEMIAUTO';
  const otro2 = e.plc.filtros.some((f, k) => k !== i && f.paso === 2);
  const b = (boton: BotonFiltro) => () => cmd({ tipo: 'filtro', filtro: i, boton });
  return (
    <div className="stack">
      <div className="row">
        <div className="seg" role="group" aria-label="Modo">
          <button aria-pressed={s.modo === 'AUTO'} onClick={b('AUTO')}>Auto</button>
          <button aria-pressed={semi} onClick={b('SEMIAUTO')}>Semiauto</button>
        </div>
        <div className="seg" role="group" aria-label="Normal/Prolong">
          <button aria-pressed={!s.prolongar} onClick={b('NORMAL')}>Normal</button>
          <button aria-pressed={s.prolongar} onClick={b('PROLONG')}>Prolong</button>
        </div>
      </div>
      <div className="row">
        <button className="btn" disabled={!(s.paso === 1 || s.hold)} onClick={b('OFFLINE')}>Offline</button>
        <button className="btn" disabled={!(s.paso === 0 || (semi && !s.hold && (s.paso === 2 || s.paso === 3)))} onClick={b('STANDBY')}>Standby</button>
        <button className="btn" disabled={!(semi && s.paso === 1 && !otro2)} onClick={b('SERVICE')}>Service</button>
        <button className="btn" disabled={!(semi && (s.paso === 3 || s.paso === 1))} onClick={b('BACKWASH')}>Backwash</button>
        <button className="btn" disabled={!(semi && (s.paso === 3 || s.paso === 1))} onClick={b('REGENERATION')}>Regeneration</button>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!(s.paso >= 6 && !s.hold)} onClick={b('STEP_ADVANCE')}>Step Advance</button>
        <button className="btn danger" disabled={!(s.paso >= 2 && !s.hold)} onClick={b('HOLD')}>Hold</button>
        <button className="btn" disabled={!s.hold} onClick={b('RESUME')}>Resume</button>
      </div>
      <div className="note">
        Auto: pasa solo Standby→Service y Service→Lavado. Semiauto: el operador inicia Service / Backwash / Regeneration. Abortar = Hold + Offline. Prolong retiene los pasos temporizados hasta Step Advance.
      </div>
    </div>
  );
}

function Matriz({ e, i }: { e: Engine; i: number }) {
  const s = e.plc.filtros[i];
  const fe = filtrosEquipo[i];
  return (
    <div className="scroll-x">
      <table className="t matrix">
        <thead>
          <tr>
            <th>Válvula</th>
            {SECUENCIA.map((p) => <th key={p.paso} className={p.paso === s.paso ? 'cur' : ''} title={p.nombre}>{p.paso}</th>)}
            <th>Ahora</th>
          </tr>
        </thead>
        <tbody>
          {FUNCIONES_VALVULA.map((fn) => {
            const tag = fe.valvulas[fn];
            const b = e.plc.valvulas.get(tag)!;
            return (
              <tr key={fn}>
                <td><span className="mono">{fn === 'FRO' ? 'RO/RW' : fn}</span> <span className="dim mono" style={{ fontSize: '0.75rem' }}>{tag}</span></td>
                {SECUENCIA.map((p) => {
                  const o = p.valvulas[COLUMNA_SECUENCIA[fn]] === 'O';
                  return <td key={p.paso} className={`${o ? 'o' : 'c'}${p.paso === s.paso ? ' cur' : ''}`}>{o ? 'O' : '·'}</td>;
                })}
                <td><span className={`pill ${estadoValvula(e, tag)}`}>{b.salida ? 'cmd O' : 'cmd C'}</span></td>
              </tr>
            );
          })}
          {Object.entries(soe.columnas.comunes).map(([k, txt]) => (
            <tr key={k}>
              <td style={{ fontSize: '0.8rem' }}>{txt.replace(/ \(by others\)/, ' (otros)')}</td>
              {soe.pasos.map((p) => {
                const v = p.comunes[k];
                return <td key={p.paso} className={`${v === 'ON' || v === 'ST' || v === 'O' ? 'o' : 'c'}${p.paso === s.paso ? ' cur' : ''}`} style={{ fontSize: '0.72rem' }}>{v === 'Off' || v === 'Cl' ? '·' : v}</td>;
              })}
              <td />
            </tr>
          ))}
          <tr>
            <td style={{ fontSize: '0.8rem' }}>Preset SOE / filosofía</td>
            {soe.pasos.map((p) => {
              const pf = SECUENCIA.find((x) => x.paso === p.paso)?.timer?.match(/(\d+) ?(s|min)/);
              const filo = pf ? Number(pf[1]) * (pf[2] === 'min' ? 60 : 1) : null;
              const difiere = p.preset_s !== null && filo !== null && p.preset_s !== filo;
              return (
                <td key={p.paso} className={p.paso === s.paso ? 'cur' : ''} style={{ fontSize: '0.68rem', textAlign: 'center', color: difiere ? 'var(--crit)' : 'var(--ink-3)' }} title={difiere ? `SOE ${p.preset} ≠ filosofía ${filo} s` : p.preset}>
                  {p.preset_s === null ? '' : p.preset_s >= 3600 ? `${p.preset_s / 60}m` : p.preset_s}{difiere ? `/${filo}` : ''}
                </td>
              );
            })}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Filtros() {
  const e = useEngine();
  const i = useSim((s) => s.filtroSel);
  const setFiltro = useSim((s) => s.setFiltro);
  const accion = useSim((s) => s.accion);
  const s = e.plc.filtros[i];
  const f = e.planta.filtros[i];
  const fe = filtrosEquipo[i];
  const p = e.params;
  const pre = s.preset(p);
  const R = p.R_limpio * (1 + p.alfa_colmatacion * f.suciedad);
  const t03 = p.T03_servicio_desde_ultimo_lavado_min * 60;
  const k03 = p.K03_servicio_desde_ultima_regen_min * 60;
  const pasoDef = proceso.filtros.secuencia.find((x) => x.paso === s.paso);
  const muestras = e.muestras.filter((m) => m.filtro === LETRAS[i]).slice(0, 5);
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Filtros de medio activo</h2>
        <div className="seg" role="tablist" aria-label="Filtro">
          {e.plc.filtros.map((x, k) => (
            <button key={k} role="tab" aria-selected={k === i} aria-pressed={k === i} onClick={() => setFiltro(k)}>
              {LETRAS[k]} · {x.hold ? 'HOLD' : x.paso}
            </button>
          ))}
        </div>
        <p>{fe.tag} · LIT {fe.transmisor_nivel} · RIO {fe.rio} · {fe.caja_conexion}</p>
      </div>

      <div className="steps" aria-label="Pasos de la secuencia">
        {SECUENCIA.map((x) => (
          <div key={x.paso} className={`step${x.paso === s.paso ? (s.hold ? ' hold' : ' cur') : ''}`} title={x.nota}>
            <b>{x.paso}</b>{x.nombre}
          </div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>
            Paso {s.paso} · {s.nombrePaso}
            {s.hold && <span className="pill trip">HOLD</span>}
            {s.prolongar && <span className="pill info">Prolong</span>}
            {s.paso === 12 && !s.permisivoK12 && <span className="pill trip">Esperando K12</span>}
          </h3>
          {s.hold && <div className="note warn">Causa: {s.holdCausa}</div>}
          {pasoDef && <div className="note">{pasoDef.nota}{pasoDef.transicion_nivel ? ` · Transición: ${pasoDef.transicion_nivel}` : ''}</div>}
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Timer del paso</dt><dd>{duracion(s.tPaso)}{pre ? ` / ${duracion(pre)}` : ''}</dd>
          </dl>
          {pre && <div className={`bar${s.tPaso > pre ? ' warn' : ''}`} style={{ margin: '4px 0 8px' }}><i style={{ width: `${Math.min(100, (100 * s.tPaso) / pre)}%` }} /></div>}
          <dl className="kv">
            <dt>Servicio desde último lavado (T03)</dt><dd>{duracion(s.tServicioLavado)} / {duracion(t03)}</dd>
          </dl>
          <div className="bar" style={{ margin: '4px 0 8px' }}><i style={{ width: `${Math.min(100, (100 * s.tServicioLavado) / t03)}%` }} /></div>
          <dl className="kv">
            <dt>Servicio desde última regeneración (K03)</dt><dd>{duracion(s.tServicioRegen)} / {duracion(k03)}</dd>
          </dl>
          <div className={`bar${s.tServicioRegen >= k03 ? ' warn' : ''}`} style={{ margin: '4px 0 8px' }}><i style={{ width: `${Math.min(100, (100 * s.tServicioRegen) / k03)}%` }} /></div>
          <dl className="kv">
            <dt>Regeneración requerida</dt><dd>{s.regenRequerida ? 'SÍ' : 'no'}</dd>
            <dt>TQI tiempo de servicio acumulado</dt><dd>{fmt(s.tqi, 1)} h</dd>
            <dt>Lavados / regeneraciones (sesión)</dt><dd>{s.lavados} / {s.regeneraciones}</dd>
            <dt>Último motivo de lavado</dt><dd>{s.ultimoMotivoLavado || '—'}</dd>
            {s.sevoCerradaAnormal && <><dt>Condición anormal</dt><dd>SEVO cerrada por nivel</dd></>}
          </dl>
          <div style={{ marginTop: 10 }}>
            <Botones e={e} i={i} />
          </div>
        </div>
        <div className="card">
          <Corte e={e} i={i} />
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <h3>Hidráulica (modelo)</h3>
          <dl className="kv">
            <dt>Nivel sobre el fondo</dt><dd>{fmt(f.h, 0)} mm</dd>
            <dt>Nivel LIT (escala 0–2980)</dt><dd>{fmt(f.h - p.z0_LIT_mm, 0)} mm</dd>
            <dt>Entrada SEVI / BWI / RI</dt><dd>{fmt(f.qSEVI, 0)} / {fmt(f.qBWI, 0)} / {fmt(f.qRI, 0)} m³/h</dd>
            <dt>Salida SEVO / BWO / RO-RW</dt><dd>{fmt(f.qSEVO, 0)} / {fmt(f.qBWO, 0)} / {fmt(f.qRW, 0)} m³/h</dd>
            <dt>Velocidad de filtración</dt><dd>{fmt(f.qSEVO / CONST_PLANTA.A_FILTRO, 2)} m/h</dd>
            <dt>Tasa de retrolavado</dt><dd>{fmt(f.qBWI / CONST_PLANTA.A_FILTRO, 1)} m/h</dd>
            <dt>Aire de lavado</dt><dd>{fmt(f.qAire, 0)} Nm³/h ({fmt(f.qAire / CONST_PLANTA.A_FILTRO, 1)} Nm³/m²·h)</dd>
            <dt>Resistencia del lecho R/R₀</dt><dd>{fmt(R / p.R_limpio, 2)}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Medio y calidad (modelo)</h3>
          <dl className="kv">
            <dt>Sólidos retenidos</dt><dd>{fmt(f.suciedad, 1)} kg</dd>
            <dt>Sólidos en suspensión</dt><dd>{fmt(f.susp, 1)} kg</dd>
            <dt>Lecho aflojado por aire</dt><dd>{fmt(f.aflojado * 100, 0)} %</dd>
            <dt>Maduración tras lavado</dt><dd>{fmt(f.maduracion * 100, 0)} %</dd>
            <dt>Capacidad oxidativa greensand</dt><dd>{fmt((100 * f.capOx) / p.cap_greensand_kg, 0)} %</dd>
            <dt>Turbidez salida</dt><dd>{fmt(f.calidadSalida.turb, 2)} NTU</dd>
            <dt>Mn salida</dt><dd>{fmt(f.calidadSalida.mn, 3)} mg/L</dd>
            <dt>Turbidez desecho BWO</dt><dd>{fmt(f.turbBWO, 0)} NTU</dd>
            <dt>Cloro libre en el filtro</dt><dd>{fmt(f.cl, 2)} mg/L</dd>
            <dt>Volumen filtrado / retrolavado</dt><dd>{fmt(f.volFiltrado, 0)} / {fmt(f.volRetrolavado, 0)} m³</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Muestra manual (paso 15)</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            La filosofía exige verificar ORP por muestra manual antes de dar Step Advance al final del enjuague rápido (comisionamiento: Cl libre &lt; 0.2 mg/L).
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => accion((en) => en.tomarMuestra(i))}>Tomar muestra</button>
            {s.paso === 15 && s.esperandoStepAdvance && <span className="pill info">Esperando Step Advance</span>}
          </div>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Hora</th><th className="n">Cl libre mg/L</th><th className="n">ORP mV</th></tr></thead>
            <tbody>
              {muestras.length === 0 && <tr><td colSpan={3} className="empty">Sin muestras de este filtro.</td></tr>}
              {muestras.map((m, k) => (
                <tr key={k}><td className="mono">{tiempoSim(m.t)}</td><td className="n" style={{ color: m.cl < 0.2 ? 'var(--good)' : 'var(--crit)' }}>{fmt(m.cl, 2)}</td><td className="n">{fmt(m.orp, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Matriz de la secuencia (filosofía rev005 + SOE de la C&amp;E rev002) · columna resaltada = paso actual</h3>
        <Matriz e={e} i={i} />
        <div className="note" style={{ marginTop: 6 }}>Válvulas idénticas en filosofía y SOE. En rojo los presets que difieren (T13, T14: se usa la filosofía). ST/SP = comando de marcha/parada al MCC; X = depende de los otros filtros. {NOMBRE_FN.SEVI} (SEVI) · {NOMBRE_FN.SEVO} (SEVO) · {NOMBRE_FN.BWI} (BWI) · {NOMBRE_FN.BWO} (BWO) · {NOMBRE_FN.AIRI} (AIRI) · {NOMBRE_FN.RI} (RI) · {NOMBRE_FN.FRO}</div>
      </div>

      <div className="grid g2">
        <div className="card"><TrendPane series={[fe.transmisor_nivel]} ventana={4 * 3600} titulo="Nivel" refs={[{ v: 1763, label: 'HH' }, { v: 280, label: 'L' }]} /></div>
        <div className="card"><TrendPane series={[`PASO-${LETRAS[i]}`]} ventana={4 * 3600} titulo="Paso de secuencia" escalon /></div>
      </div>
    </div>
  );
}
