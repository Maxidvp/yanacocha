// Faceplates (panel lateral) por tipo de objeto seleccionado en los mímicos.
import { Fragment, useState, type ReactNode } from 'react';
import { alarmas as alarmasDoc, equipoPorTag, instrumentoPorTag, valvulaPorTag, cargaPorTag, esAConfirmar, filtrosEquipo, LETRA_FILTRO, type Json } from '../data';
import { useEngine, useSim } from '../store/sim';
import type { Engine } from '../sim/engine';
import { rangoAI } from '../sim/params';
import { CONST_PLANTA, type ModoFallaTx } from '../sim/process/plant';
import type { FallaFinCarrera, Selector } from '../sim/process/devices';
import { estadoMotor, estadoValvula, ESTADO_TXT, fmt, lecturaLocal, manualAbierta } from './common/util';
import { tipoManual } from './common/symbols';
import { t, td, ts, campo } from '../i18n';

export function Ficha({ datos, excluir = [] }: { datos: Record<string, Json | undefined>; excluir?: string[] }) {
  const filas = Object.entries(datos).filter(([k, v]) => v !== undefined && !excluir.includes(k) && !k.startsWith('_'));
  // tr = false: texto original (para detectar A CONFIRMAR); tr = true: claves con campo() y valores con td()
  const txt = (v: Json | undefined, tr = false): string => {
    const val = (x: Json): string => (tr ? td(String(x)) : String(x));
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : val(x))).join(' · ');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${tr ? campo(k) : k}: ${typeof x === 'object' && x !== null ? JSON.stringify(x) : val(x)}`).join(' · ');
    return val(v);
  };
  return (
    <dl className="kv" style={{ gridTemplateColumns: 'minmax(90px, 0.6fr) minmax(0, 1.4fr)' }}>
      {filas.map(([k, v]) => {
        const original = txt(v);
        return (
          <span key={k} style={{ display: 'contents' }}>
            <dt>{campo(k)}</dt>
            <dd style={{ textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: '0.84rem', overflowWrap: 'anywhere' }}>
              {txt(v, true)} {esAConfirmar(original) && <span className="badge A_CONFIRMAR">{t('A confirmar')}</span>}
            </dd>
          </span>
        );
      })}
    </dl>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="section">
      <div className="lbl">{titulo}</div>
      {children}
    </section>
  );
}

function Toggle({ label, valor, onChange, peligro }: { label: string; valor: boolean; onChange: (v: boolean) => void; peligro?: boolean }) {
  return (
    <label className="row" style={{ gap: 6, fontSize: '0.88rem' }}>
      <input type="checkbox" checked={valor} onChange={(ev) => onChange(ev.target.checked)} />
      <span style={{ color: peligro && valor ? 'var(--crit)' : undefined }}>{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ motor
function FaceMotor({ e, tag }: { e: Engine; tag: string }) {
  const cmd = useSim((s) => s.cmd);
  const accion = useSim((s) => s.accion);
  const b = e.plc.motor(tag);
  const m = e.planta.motor(tag);
  const eq = equipoPorTag(tag);
  const carga = cargaPorTag(tag);
  const comp = e.planta.compresores.find((c) => c.motor === m);
  const sop = e.planta.soplantes.find((s) => s.motor === m);
  const est = estadoMotor(e, tag);
  const remoto = b.selector === 'REMOTO';
  return (
    <>
      <div className="row">
        <span className={`pill ${est}`}>{b.run ? t('En marcha') : t('Parado')}</span>
        <span className={`pill ${b.avl ? 'on' : 'off'}`}>{b.avl ? t('Disponible') : t('No disponible')}</span>
        {b.flt && <span className="pill trip">{t('Falla MPR')}</span>}
        {b.fts && <span className="pill trip">FTS</span>}
        {!b.cp && <span className="pill trip">{t('Sin tensión control')}</span>}
        {b.selector === 'LOCAL' && <span className="pill info">Local</span>}
      </div>
      {b.bloqueo && <div className="note warn">{t('Interlock: {b}', { b: ts(b.bloqueo) })}</div>}
      <Seccion titulo={t('Selector Local / Off / Remoto (configurado en el PCS)')}>
        <div className="seg" role="group" aria-label="Selector L/O/R">
          {(['LOCAL', 'OFF', 'REMOTO'] as Selector[]).map((s) => (
            <button key={s} aria-pressed={b.selector === s} onClick={() => cmd({ tipo: 'selector', tag, valor: s })}>{s === 'REMOTO' ? t('REMOTO') : s}</button>
          ))}
        </div>
      </Seccion>
      <Seccion titulo={b.deSecuencia ? t('Modo y comandos (equipo de secuencia: A/M)') : t('Comandos (arranque manual desde PCS)')}>
        <div className="row">
          {b.deSecuencia && (
            <div className="seg" role="group" aria-label="Auto/Manual">
              <button aria-pressed={b.modoAM === 'AUTO'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'AUTO' })}>AUTO</button>
              <button aria-pressed={b.modoAM === 'MANUAL'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'MANUAL' })}>MANUAL</button>
            </div>
          )}
          <button className="btn on" aria-pressed={b.run} disabled={!remoto || b.modoAM !== 'MANUAL'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'START' })}>START</button>
          <button className="btn off" aria-pressed={!b.run} disabled={!remoto || b.modoAM !== 'MANUAL'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'STOP' })}>STOP</button>
          <button className="btn" disabled={!b.fts} onClick={() => cmd({ tipo: 'motor', tag, accion: 'RESET' })}>Reset FTS</button>
        </div>
      </Seccion>
      {m.tieneLCS && (
        <Seccion titulo={t('Estación local {tag}-M-HS (campo)', { tag })}>
          <div className="lcs">
            <button
              className="jog"
              onPointerDown={() => accion((en) => en.setJog(tag, true))}
              onPointerUp={() => accion((en) => en.setJog(tag, false))}
              onPointerLeave={() => accion((en) => en.setJog(tag, false))}
              aria-label={t('START/JOG mantener presionado')}
            >
              JOG
            </button>
            <button className="mushroom" aria-pressed={m.estop} onClick={() => accion((en) => en.setEstop(tag, !m.estop))}>
              {m.estop ? t('TIRAR') : 'E-STOP'}
            </button>
            <span className="note">{t('JOG solo en LOCAL (mantener). El E-Stop actúa siempre y queda enclavado.')}</span>
          </div>
        </Seccion>
      )}
      <Seccion titulo={t('Medidas del motor (MPR / modelo)')}>
        <dl className="kv">
          <dt>{t('Corriente')}</dt><dd>{fmt(m.corriente, 1)} A (FLA {fmt(m.fla, 0)} A)</dd>
          <dt>{t('Potencia absorbida')}</dt><dd>{fmt(m.kW, 2)} kW</dd>
          <dt>{t('Velocidad')}</dt><dd>{fmt(m.velocidad * 100, 0)} %</dd>
          <dt>{t('Temperatura devanado (modelo)')}</dt><dd>{fmt(m.tempDevanado, 1)} °C</dd>
          <dt>{t('Horas de marcha / arranques')}</dt><dd>{fmt(m.horas, 2)} h / {m.arranques}</dd>
          <dt>{t('Energía')}</dt><dd>{fmt(m.kWh, 1)} kWh</dd>
        </dl>
      </Seccion>
      {comp && (
        <Seccion titulo={t('Controlador Atlas Copco MK5 (Modbus TCP)')}>
          <dl className="kv">
            <dt>{t('Estado')}</dt><dd>{ts(comp.estado)}{comp.paradaVendor ? ` · ${t('parado por vacío')}` : ''}</dd>
            <dt>{t('Caudal entregado')}</dt><dd>{fmt(comp.q, 0)} Nm³/h</dd>
            <dt>{t('PT-711 presión descarga')}</dt><dd>{fmt(comp.pDescarga, 1)} kPa</dd>
            <dt>{t('TT-703 temp. descarga')}</dt><dd>{fmt(comp.tDescarga, 1)} °C</dd>
            <dt>{t('PT-704 presión aceite')}</dt><dd>{fmt(comp.pAceite, 0)} kPa</dd>
            <dt>{t('TT-705 temp. aceite')}</dt><dd>{fmt(comp.tAceite, 1)} °C</dd>
            <dt>{t('PDT-701 ΔP filtro aire')}</dt><dd>{fmt(comp.dpFiltro, 2)} kPa</dd>
            <dt>{t('TT-706/707/708 devanados')}</dt><dd>{fmt(m.tempDevanado, 1)} / {fmt(m.tempDevanado + 1.2, 1)} / {fmt(m.tempDevanado - 0.8, 1)} °C</dd>
            <dt>{t('TT-709/710 rodamientos')}</dt><dd>{fmt(comp.tRodLA, 1)} / {fmt(comp.tRodLOA, 1)} °C</dd>
            <dt>{t('HY-712 solenoide carga')}</dt><dd>{comp.estado === 'CARGA' ? t('CARGA') : t('DESCARGA')}</dd>
            <dt>{t('Tiempo en vacío')}</dt><dd>{fmt(comp.tVacio / 60, 1)} / {e.params.comp_vacio_min} min</dd>
          </dl>
          <Toggle label={t('Válvula manual {tag} abierta', { tag: comp.valvulaManual })} valor={e.planta.manuales[comp.valvulaManual] ?? true} onChange={(v) => accion((en) => en.setManual(comp.valvulaManual, v))} />
        </Seccion>
      )}
      {sop && (
        <Seccion titulo={t('Soplante tri-lóbulo (modelo)')}>
          <dl className="kv">
            <dt>{t('Caudal')}</dt><dd>{fmt(sop.q, 0)} Nm³/h</dd>
            <dt>{t('{tag} presión descarga', { tag: sop.pi })}</dt><dd>{fmt(sop.pDescarga, 1)} kPag</dd>
            <dt>{t('Temp. descarga')}</dt><dd>{fmt(sop.tDescarga, 0)} °C</dd>
            <dt>{sop.psv} (64 kPag)</dt><dd>{sop.qPSV > 1 || (e.planta.qAirePSVsoplantes > 10 && sop.q > 0) ? t('ALIVIANDO') : t('cerrada')}</dd>
            {sop.vRetencion && <><dt>{sop.vRetencion}</dt><dd>{sop.retencionAbierta ? t('abierta') : t('cerrada')}</dd></>}
          </dl>
          {sop.vDescarga && <Toggle label={t('Válvula manual {tag} abierta', { tag: sop.vDescarga })} valor={manualAbierta(e, sop.vDescarga)} onChange={(v) => accion((en) => en.setManual(sop.vDescarga!, v))} />}
        </Seccion>
      )}
      <Seccion titulo={t('Inyección de fallas')}>
        <Toggle label={t('Disparo MPR (sobrecarga / tierra / desbalance)')} valor={m.falla} onChange={(v) => accion((en) => en.setMotorFalla(tag, 'falla', v))} peligro />
        <Toggle label={t('El contactor no cierra (falla al arrancar)')} valor={m.noArranca} onChange={(v) => accion((en) => en.setMotorFalla(tag, 'noArranca', v))} peligro />
        <Toggle label={t('Pérdida de tensión de control')} valor={m.sinTensionControl} onChange={(v) => accion((en) => en.setMotorFalla(tag, 'sinTensionControl', v))} peligro />
        {sop && <Toggle label={t('Rotura de correa (motor gira, sin aire)')} valor={!!e.planta.fallas.correaRota[tag]} onChange={(v) => accion((en) => en.setFallaEquipo('correaRota', tag, v))} peligro />}
        {comp && <Toggle label={t('Filtro de aire de admisión tapado')} valor={!!e.planta.fallas.filtroAireTapado[tag]} onChange={(v) => accion((en) => en.setFallaEquipo('filtroAireTapado', tag, v))} peligro />}
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => accion((en) => en.resetMPR(tag))}>{t('Reset MPR (en el MCC)')}</button>
      </Seccion>
      {eq && (
        <Seccion titulo={t('Ficha técnica')}>
          <Ficha datos={eq} excluir={['tag']} />
        </Seccion>
      )}
      {carga && (
        <Seccion titulo={t('Lista de cargas')}>
          <Ficha datos={carga as unknown as Record<string, Json>} excluir={['tag']} />
        </Seccion>
      )}
    </>
  );
}

// ------------------------------------------------------------------ válvula
function FaceValvula({ e, tag }: { e: Engine; tag: string }) {
  const cmd = useSim((s) => s.cmd);
  const accion = useSim((s) => s.accion);
  const b = e.plc.valvulas.get(tag);
  const v = e.planta.valvulasOnOff.get(tag);
  const d = valvulaPorTag(tag);
  if (!b || !v) return <p className="empty">{t('Válvula sin señales de I/O.')}</p>;
  const est = estadoValvula(e, tag);
  const paso = b.filtro !== null ? e.plc.filtros[b.filtro].paso : null;
  const permiteManual = b.filtro === null || paso === 0;
  return (
    <>
      <div className="row">
        <span className={`pill ${est}`}>{t(ESTADO_TXT[est])}</span>
        <span className="pill info">{t('Modo {m}', { m: b.modo })}</span>
        {b.zao && <span className="pill trip">ZAO</span>}
        {b.zac && <span className="pill trip">ZAC</span>}
        {e.io.punto(tag).forzado && <span className="pill forced">{t('DO forzada')}</span>}
      </div>
      <Seccion titulo={t('Señales')}>
        <dl className="kv">
          <dt>{t('DO {tag} (comando, 1 = abrir)', { tag })}</dt><dd>{b.salida ? '1' : '0'}</dd>
          <dt>DI {tag}-ZSO</dt><dd>{b.zso ? '1' : '0'}</dd>
          <dt>DI {tag}-ZSC</dt><dd>{b.zsc ? '1' : '0'}</dd>
          <dt>{t('Posición real (modelo)')}</dt><dd>{fmt(v.pos * 100, 0)} %</dd>
          <dt>{t('Carreras')}</dt><dd>{v.carreras}</dd>
          <dt>{t('Retardo de discrepancia')}</dt><dd>{b.retardo} s</dd>
          {paso !== null && <><dt>{t('Filtro {f} – paso', { f: LETRA_FILTRO[b.filtro!] })}</dt><dd>{paso} {td(e.plc.filtros[b.filtro!].nombrePaso)}</dd></>}
        </dl>
      </Seccion>
      <Seccion titulo={t('Operación desde PCS')}>
        {!permiteManual && <div className="note">{t('Las válvulas de filtro se operan en manual solo con el filtro en OFFLINE (mantenimiento).')}</div>}
        <div className="row">
          <div className="seg" role="group" aria-label="Auto/Manual">
            <button aria-pressed={b.modo === 'AUTO'} onClick={() => cmd({ tipo: 'valvula', tag, accion: 'AUTO' })}>AUTO</button>
            <button aria-pressed={b.modo === 'MANUAL'} disabled={!permiteManual} onClick={() => cmd({ tipo: 'valvula', tag, accion: 'MANUAL' })}>MANUAL</button>
          </div>
          <button className="btn on" aria-pressed={b.salida} disabled={b.modo !== 'MANUAL'} onClick={() => cmd({ tipo: 'valvula', tag, accion: 'ABRIR' })}>{t('ABRIR')}</button>
          <button className="btn off" aria-pressed={!b.salida} disabled={b.modo !== 'MANUAL'} onClick={() => cmd({ tipo: 'valvula', tag, accion: 'CERRAR' })}>{t('CERRAR')}</button>
        </div>
      </Seccion>
      <Seccion titulo={t('Inyección de fallas')}>
        <Toggle label={t('Válvula trabada (no se mueve)')} valor={v.trabada} onChange={(x) => accion((en) => en.setFallaValvula(tag, x, v.fallaFC))} peligro />
        <label className="row" style={{ fontSize: '0.88rem' }}>
          {t('Final de carrera')}
          <select value={v.fallaFC} onChange={(ev) => accion((en) => en.setFallaValvula(tag, v.trabada, ev.target.value as FallaFinCarrera))}>
            <option value="ok">Normal</option>
            <option value="zso_trabado_0">{t('ZSO no actúa (0)')}</option>
            <option value="zsc_trabado_0">{t('ZSC no actúa (0)')}</option>
            <option value="zso_trabado_1">{t('ZSO pegado (1)')}</option>
            <option value="zsc_trabado_1">{t('ZSC pegado (1)')}</option>
          </select>
        </label>
      </Seccion>
      {d && (
        <Seccion titulo={t('Ficha técnica (lista de válvulas)')}>
          <Ficha datos={d} excluir={['tag', 'senales']} />
        </Seccion>
      )}
    </>
  );
}

// ------------------------------------------------------------------ instrumento
const NIVELES = ['HH', 'H', 'L', 'LL'];
function FaceInstrumento({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((s) => s.accion);
  const [valorF, setValorF] = useState('');
  const [deriva, setDeriva] = useState('50');
  const d = instrumentoPorTag(tag);
  const enIO = e.io.tiene(tag);
  const pt = enIO ? e.io.punto(tag) : null;
  const pv = e.plc.pv[tag] ?? (enIO ? e.io.ai(tag) : lecturaLocal(e, tag));
  const sopPI = e.planta.soplantes.find((x) => x.pi === tag);
  const rango = rangoAI(tag, e.params);
  const falla = e.planta.fallas.transmisor[tag]?.modo ?? 'ok';
  const suf = tag.split('-')[1];
  const lim = alarmasDoc.analogicas[tag] ?? (tag.startsWith('LIT-1603056') && tag !== 'LIT-160305601' ? alarmasDoc.filtros_nivel_mm : undefined);
  const esCOM = pt?.tipo === 'COM-AI';
  return (
    <>
      <div className="row">
        <span className={`pill ${pv.mala ? 'trip' : 'on'}`}>{pv.mala ? t('Falla de lazo') : t('Calidad buena')}</span>
        {pt?.forzado && <span className="pill forced">{t('Forzado')}</span>}
        {falla !== 'ok' && <span className="pill trip">{t('Falla inyectada: {f}', { f: t(falla) })}</span>}
        {esCOM && <span className="pill info">{t('Señal por comunicación (por otros)')}</span>}
      </div>
      {sopPI && (
        <Seccion titulo={t('Manómetro local (sin señal al PLC)')}>
          <dl className="kv">
            <dt>{t('Lectura')}</dt><dd style={{ fontSize: '1.05rem' }}>{fmt(sopPI.piLectura, 1)} kPag</dd>
            <dt>{t('Presión real de descarga')}</dt><dd>{fmt(sopPI.pDescarga, 1)} kPag</dd>
          </dl>
          {sopPI.vAislPI && <Toggle label={t('{tag} aislamiento abierto', { tag: sopPI.vAislPI })} valor={manualAbierta(e, sopPI.vAislPI)} onChange={(v) => accion((en) => en.setManual(sopPI.vAislPI!, v))} />}
          {sopPI.vDrenPI && <Toggle label={t('{tag} venteo abierto', { tag: sopPI.vDrenPI })} valor={manualAbierta(e, sopPI.vDrenPI)} onChange={(v) => accion((en) => en.setManual(sopPI.vDrenPI!, v))} />}
          <div className="note">{t('Aislamiento cerrado: queda la presión atrapada. Venteo abierto: lee 0.')}</div>
        </Seccion>
      )}
      {!sopPI && <Seccion titulo={t('Medición')}>
        <dl className="kv">
          <dt>{t('Valor (PLC)')}</dt><dd style={{ fontSize: '1.05rem' }}>{fmt(pv.eu, 2)} {pt?.unidad ?? d?.unidad ?? ''}</dd>
          {!esCOM && <><dt>{t('Señal')}</dt><dd>{fmt(pv.mA, 2)} mA</dd></>}
          {!esCOM && <><dt>{t('Rango calibrado')}</dt><dd>{rango[0]} – {rango[1]} {pt?.unidad ?? ''}</dd></>}
          {pt?.rio && <><dt>RIO</dt><dd>{pt.rio}</dd></>}
        </dl>
      </Seccion>}
      {lim && (
        <Seccion titulo={t('Alarmas')}>
          <table className="t">
            <thead><tr><th>{t('Nivel')}</th><th className="n">SP</th><th className="n">{t('Retardo')}</th><th>{t('Estado')}</th></tr></thead>
            <tbody>
              {NIVELES.filter((n) => (lim as Record<string, unknown>)[n] !== undefined).map((n) => {
                const id = `${tag[0]}A${n}-${suf}`;
                const st = e.plc.alarmas.estados.get(id);
                const ret = (lim as { retardo_s?: number | Record<string, number> }).retardo_s;
                return (
                  <tr key={n}>
                    <td className="mono">{id}</td>
                    <td className="n">{String((lim as Record<string, unknown>)[n])}</td>
                    <td className="n">{typeof ret === 'number' ? ret : ret?.[n] ?? '—'} s</td>
                    <td>{st?.activa ? <span className="prio ALTA">{t('ACTIVA')}</span> : st?.inhibida ? <span className="dim">{t('inhibida')}</span> : <span className="dim">{t('normal')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Seccion>
      )}
      {enIO && pt && (
        <Seccion titulo={t('Forzado (tabla de I/O)')}>
          <div className="row">
            <input type="number" id={`forzar-${tag}`} placeholder={t('valor {u}', { u: pt.unidad ?? '' })} value={valorF} onChange={(ev) => setValorF(ev.target.value)} />
            <button className="btn" disabled={valorF === ''} onClick={() => accion((en) => {
              const v = Number(valorF);
              if (esCOM) en.io.forzar(tag, v);
              else en.io.forzar(tag, 4 + (16 * (v - rango[0])) / (rango[1] - rango[0]));
            })}>{t('Forzar')}</button>
            <button className="btn" disabled={!pt.forzado} onClick={() => accion((en) => en.io.liberar(tag))}>{t('Liberar')}</button>
          </div>
        </Seccion>
      )}
      {!esCOM && enIO && (
        <Seccion titulo={t('Inyección de falla del transmisor')}>
          <div className="row">
            <select value={falla} onChange={(ev) => accion((en) => en.setFallaTransmisor(tag, { modo: ev.target.value as ModoFallaTx, deriva: Number(deriva) }))}>
              <option value="ok">{t('Sin falla')}</option>
              <option value="congelado">{t('Valor congelado')}</option>
              <option value="bajo">{t('Falla baja (3.6 mA)')}</option>
              <option value="alto">{t('Falla alta (21.5 mA)')}</option>
              <option value="abierto">{t('Lazo abierto (0 mA)')}</option>
              <option value="deriva">{t('Deriva')}</option>
            </select>
            <label className="row" style={{ gap: 4, fontSize: '0.85rem' }}>
              {t('deriva')}
              <input type="number" value={deriva} onChange={(ev) => setDeriva(ev.target.value)} style={{ width: '5em' }} />
              /h
            </label>
          </div>
        </Seccion>
      )}
      {d && (
        <Seccion titulo={t('Ficha técnica (índice de instrumentos)')}>
          <Ficha datos={d} excluir={['tag', 'alarmas']} />
        </Seccion>
      )}
    </>
  );
}

// ------------------------------------------------------------------ válvula manual
const tipoManualTxt = (tp: ReturnType<typeof tipoManual>) => (tp === 'mariposa' ? t('Mariposa manual') : tp === 'bola' ? t('Bola manual') : t('Retención (automática)'));

/** Qué hace cada válvula manual en el modelo y qué variables mirar. */
function efectoManual(e: Engine, tag: string): { texto: string; filas: [string, string][] } {
  const pl = e.planta;
  const num = tag.slice(-6);
  const sop = pl.soplantes.find((s) => [s.vDescarga, s.vRetencion, s.vAislPI, s.vDrenPI].includes(tag));
  const comp = pl.compresores.find((c) => c.valvulaManual === tag);
  const iFiltro = ['309718', '309720', '309722', '309724'].indexOf(num);
  if (num === '309703') return { texto: t('Drena TK-30015 a la canaleta (≈ 250 m³/h con nivel normal).'), filas: [[t('Caudal de drenaje'), `${fmt(pl.qDrenaje15, 0)} m³/h`], [t('Nivel TK-30015'), `${fmt(pl.L15, 0)} mm`]] };
  if (num === '309704' || num === '309708') return { texto: t('Aísla la rama de FIT/FV-160305603: cerrada, no pasa caudal por la FV aunque el FIC la abra.'), filas: [[t('Caudal por la rama FIT/FV'), `${fmt(pl.qBypassFV, 0)} m³/h`], ['FIT-160305603', `${fmt(e.plc.pv['FIT-160305603']?.eu, 0)} m³/h`]] };
  if (num === '309709') return { texto: t('Rodea VBF-309704, FIT-160305603, FV-160305603 y VBF-309708: ese caudal no se mide ni se controla.'), filas: [[t('Caudal por VBF-309709'), `${fmt(pl.qBypass709, 0)} m³/h`], [t('Total de bypass'), `${fmt(pl.qBypass, 0)} m³/h`]] };
  if (num === '309705' || num === '309707') return { texto: t('Drenaje de ½″ de la línea de bypass: con la línea cargada desde TK-30015 descarga el caudal del parámetro de drenaje.'), filas: [[t('Caudal de drenajes de la línea'), `${fmt(pl.qDrenajeBypass, 1)} m³/h`]] };
  if (iFiltro >= 0) return { texto: t('Drena el filtro al colector de desecho.'), filas: [[t('Caudal de drenaje'), `${fmt(pl.filtros[iFiltro].qDrenaje, 1)} m³/h`], [t('Nivel del filtro'), `${fmt(pl.filtros[iFiltro].h, 0)} mm`]] };
  if (comp) return { texto: t('Aísla la descarga del compresor hacia TK-30015: cerrada, la presión sube hasta que el MK5 descarga.'), filas: [[t('Presión de descarga'), `${fmt(comp.pDescarga, 1)} kPa`], [t('Estado MK5'), ts(comp.estado)]] };
  if (sop && tag === sop.vDescarga) return { texto: t('Aísla la descarga del soplante: cerrada, el soplante en marcha trabaja contra su PSV y no aporta aire al colector.'), filas: [[t('Presión de descarga'), `${fmt(sop.pDescarga, 1)} kPag`], [t('Alivio por PSV'), `${fmt(sop.qPSV, 0)} Nm³/h`]] };
  if (sop && tag === sop.vRetencion) return { texto: t('Retención: abre sola con caudal del soplante e impide el retorno desde el colector.'), filas: [[t('Caudal del soplante'), `${fmt(sop.q, 0)} Nm³/h`]] };
  if (sop && tag === sop.vAislPI) return { texto: t('Aísla el manómetro: cerrada, queda la presión atrapada.'), filas: [[sop.pi, `${fmt(sop.piLectura, 1)} kPag`], [t('Presión real de descarga'), `${fmt(sop.pDescarga, 1)} kPag`]] };
  if (sop && tag === sop.vDrenPI) return { texto: t('Ventea el manómetro: abierta, lee 0.'), filas: [[sop.pi, `${fmt(sop.piLectura, 1)} kPag`]] };
  return { texto: t('Sin efecto modelado.'), filas: [] };
}

function FaceManual({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((s) => s.accion);
  const d = valvulaPorTag(tag);
  const tipo = tipoManual(tag);
  const abierta = manualAbierta(e, tag);
  const ef = efectoManual(e, tag);
  return (
    <>
      <div className="row">
        <span className={`pill ${abierta ? 'on' : 'off'}`}>{abierta ? t('Abierta') : t('Cerrada')}</span>
        <span className="pill info">{tipoManualTxt(tipo)}</span>
        <span className="pill unk">{t('Sin señales al PLC')}</span>
      </div>
      {tipo !== 'retencion' && (
        <div className="row">
          <button className="btn" disabled={abierta} onClick={() => accion((en) => en.setManual(tag, true))}>{t('Abrir')}</button>
          <button className="btn" disabled={!abierta} onClick={() => accion((en) => en.setManual(tag, false))}>{t('Cerrar')}</button>
        </div>
      )}
      <Seccion titulo={t('Efecto en el simulador')}>
        <p style={{ margin: '0 0 6px' }}>{ef.texto}</p>
        {ef.filas.length > 0 && (
          <dl className="kv">
            {ef.filas.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        )}
      </Seccion>
      {d && (
        <Seccion titulo={t('Ficha técnica (lista de válvulas)')}>
          <Ficha datos={d} excluir={['tag']} />
        </Seccion>
      )}
    </>
  );
}

// ------------------------------------------------------------------ FIC-603
function FaceFIC({ e }: { e: Engine }) {
  const cmd = useSim((s) => s.cmd);
  const seleccionar = useSim((s) => s.seleccionar);
  const accion = useSim((s) => s.accion);
  const plc = e.plc;
  const [manual, setManual] = useState(String(Math.round(plc.salidaManualFIC)));
  const d = valvulaPorTag('FV-160305603');
  const fit = plc.pv['FIT-160305603'];
  return (
    <>
      <div className="row">
        <span className={`pill ${plc.autoEfectivoFIC ? 'on' : 'info'}`}>{plc.modoFIC === 'MANUAL' ? 'MANUAL' : plc.autoEfectivoFIC ? 'AUTO' : t('MANUAL 0 % (programa)')}</span>
        {e.planta.fv603.trabada && <span className="pill trip">{t('FV trabada')}</span>}
      </div>
      <Seccion titulo={t('FY-160305603 – cálculo del setpoint')}>
        <dl className="kv">
          <dt>{t('FIC-160305065 (permeado RO)')}</dt><dd>{fmt(plc.pv['FIC-160305065'].eu, 0)} m³/h</dd>
          <dt>+ FIC-160304333 (HDS)</dt><dd>{fmt(plc.pv['FIC-160304333'].eu, 0)} m³/h</dd>
          <dt>{t('− capacidad de filtros ({n} fuera de servicio)', { n: plc.filtrosFuera })}</dt><dd>{fmt(plc.capacidadFiltros, 0)} m³/h</dd>
          <dt>{t('= SP (limitado 0–853)')}</dt><dd style={{ fontWeight: 700 }}>{fmt(plc.spFY, 0)} m³/h</dd>
          <dt>{t('Umbral para Auto')}</dt><dd>{e.params.bypass_umbral_auto_m3h} m³/h</dd>
        </dl>
      </Seccion>
      <Seccion titulo={t('FIC-160305603 (acción inversa)')}>
        <dl className="kv">
          <dt>PV FIT-160305603</dt><dd>{fmt(fit.eu, 0)} m³/h</dd>
          <dt>SP</dt><dd>{fmt(plc.spFY, 0)} m³/h</dd>
          <dt>OUT → FCV-160305603</dt><dd>{fmt(plc.salidaFIC, 1)} %</dd>
          <dt>{t('FZI-160305603 posición')}</dt><dd>{fmt(plc.pv['FZI-160305603'].eu, 1)} %</dd>
          <dt>Kc / Ti / Td</dt><dd>{e.params.pid_Kc} / {e.params.pid_Ti} s / {e.params.pid_Td} s</dd>
        </dl>
        <div className="seg" role="group" aria-label={t('Modo FIC')}>
          {(['PROGRAMA', 'AUTO', 'MANUAL'] as const).map((m) => (
            <button key={m} aria-pressed={plc.modoFIC === m} onClick={() => cmd({ tipo: 'fic', modo: m })}>{m === 'PROGRAMA' ? t('Programa (filosofía)') : m}</button>
          ))}
        </div>
        <div className="row">
          <label htmlFor="fic-man" className="lbl">{t('Salida manual %')}</label>
          <input id="fic-man" type="number" min={0} max={100} value={manual} onChange={(ev) => setManual(ev.target.value)} />
          <button className="btn" onClick={() => cmd({ tipo: 'fic', salida: Number(manual) })}>{t('Aplicar')}</button>
        </div>
        <div className="note">{t('Programa: entrada < {u} m³/h → FV al 0 %; ≥ umbral → Auto. La FV es aire-abre / resorte-cierra: cierra ante falla de aire o de señal.', { u: e.params.bypass_umbral_auto_m3h })}</div>
      </Seccion>
      <Seccion titulo={t('Estación de bypass (P&ID)')}>
        <dl className="kv">
          <dt>{t('Rama FIT/FV (VBF-309704 → VBF-309708)')}</dt><dd>{fmt(e.planta.qBypassFV, 0)} m³/h</dd>
          <dt>{t('Rodeo VBF-309709 (no lo mide la FIT)')}</dt><dd>{fmt(e.planta.qBypass709, 0)} m³/h</dd>
          <dt>{t('Drenajes VBA-309705/707')}</dt><dd>{fmt(e.planta.qDrenajeBypass, 1)} m³/h</dd>
          <dt>{t('Total al sumidero de agua filtrada')}</dt><dd style={{ fontWeight: 700 }}>{fmt(e.planta.qBypass, 0)} m³/h</dd>
        </dl>
        <div className="row">
          {['16045-VBF-309704', '16045-VBA-309705', '16045-VBA-309707', '16045-VBF-309708', '16045-VBF-309709'].map((tag) => (
            <button key={tag} className="btn small" onClick={() => seleccionar({ tipo: 'manual', tag })}>
              <span className={`dot ${manualAbierta(e, tag) ? 'on' : 'off'}`} /> {tag.replace('16045-', '')}
            </button>
          ))}
        </div>
      </Seccion>
      <Seccion titulo={t('Inyección de fallas')}>
        <Toggle label={t('FV-160305603 trabada')} valor={e.planta.fv603.trabada} onChange={(v) => accion((en) => en.setFallaValvula('FV-160305603', v))} peligro />
        <Toggle label={t('Válvula manual de bypass VBF-309709 abierta (rodeo de la FV)')} valor={!!e.planta.manuales['16045-VBF-309709']} onChange={(v) => accion((en) => en.setManual('16045-VBF-309709', v))} />
      </Seccion>
      {d && (
        <Seccion titulo={t('Ficha técnica FV-160305603')}>
          <Ficha datos={d} excluir={['tag', 'senales']} />
        </Seccion>
      )}
    </>
  );
}

// ------------------------------------------------------------------ tanques y fronteras
function FaceTanque({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((s) => s.accion);
  const pl = e.planta;
  const eq = equipoPorTag(tag);
  if (tag === '16045-TK-30015') {
    return (
      <>
        <Seccion titulo={t('Balance')}>
          <dl className="kv">
            <dt>{t('Nivel')}</dt><dd>{fmt(pl.L15, 0)} mm</dd>
            <dt>{t('Volumen')}</dt><dd>{fmt((CONST_PLANTA.A_TK15 * pl.L15) / 1000, 1)} m³</dd>
            <dt>{t('Entrada (RO + HDS)')}</dt><dd>{fmt(pl.qEntrada, 0)} m³/h</dd>
            <dt>{t('Salida a filtros (vertedero)')}</dt><dd>{fmt(pl.qAFiltros, 0)} m³/h</dd>
            <dt>Bypass N12</dt><dd>{fmt(pl.qBypass, 0)} m³/h</dd>
            <dt>{t('Rebalse N11')}</dt><dd>{fmt(pl.qRebalse15, 0)} m³/h</dd>
            <dt>{t('Tiempo de residencia')}</dt><dd>{fmt(pl.qEntrada > 0 ? ((CONST_PLANTA.A_TK15 * pl.L15) / 1000 / pl.qEntrada) * 60 : NaN, 1)} min</dd>
            <dt>{t('Aire de aireación')}</dt><dd>{fmt(pl.qAireTK15, 0)} Nm³/h</dd>
          </dl>
        </Seccion>
        <Seccion titulo={t('Química (modelo carbonato)')}>
          <dl className="kv">
            <dt>{t('pH real / medido')}</dt><dd>{fmt(pl.pH15, 2)} / {fmt(pl.pH15medido, 2)}</dd>
            <dt>{t('Alcalinidad')}</dt><dd>{fmt(pl.c15.alk * 50, 1)} mg/L CaCO₃</dd>
            <dt>{t('Carbono inorgánico total')}</dt><dd>{fmt(pl.c15.ct, 3)} mmol/L</dd>
            <dt>{t('Conductividad')}</dt><dd>{fmt(pl.c15.cond, 0)} µS/cm</dd>
            <dt>{t('Sulfato')}</dt><dd>{fmt(pl.c15.so4, 0)} mg/L</dd>
            <dt>{t('H₂SO₄ / NaOH (por otros)')}</dt><dd>{fmt(pl.frontera.acidoLh, 1)} / {fmt(pl.frontera.sodaLh, 1)} L/h</dd>
          </dl>
        </Seccion>
        <Seccion titulo={t('Válvulas manuales')}>
          <Toggle label={t('{tag} drenaje a canaleta', { tag: '16045-VBF-309703' })} valor={!!pl.manuales['16045-VBF-309703']} onChange={(v) => accion((en) => en.setManual('16045-VBF-309703', v))} />
          <Toggle label={t('{tag} aislamiento bypass', { tag: '16045-VBF-309704' })} valor={!!pl.manuales['16045-VBF-309704']} onChange={(v) => accion((en) => en.setManual('16045-VBF-309704', v))} />
          <Toggle label={t('{tag} aislamiento bypass', { tag: '16045-VBF-309708' })} valor={!!pl.manuales['16045-VBF-309708']} onChange={(v) => accion((en) => en.setManual('16045-VBF-309708', v))} />
        </Seccion>
        {eq && <Seccion titulo={t('Ficha técnica')}><Ficha datos={eq} excluir={['tag']} /></Seccion>}
      </>
    );
  }
  if (tag === '16045-TK-30016') {
    return (
      <>
        <Seccion titulo={t('Balance (por otros)')}>
          <dl className="kv">
            <dt>{t('Nivel')}</dt><dd>{fmt(pl.L16, 0)} mm</dd>
            <dt>{t('Entrada desde sumidero')}</dt><dd>{fmt(pl.qSumidero, 0)} m³/h</dd>
            <dt>{t('HDS directa')}</dt><dd>{fmt(pl.qHDS16, 0)} m³/h</dd>
            <dt>{t('Bombas de liberación')}</dt><dd>{fmt(pl.frontera.qLiberacion, 0)} m³/h</dd>
            <dt>{t('Bombas de retrolavado')}</dt><dd>{fmt(pl.frontera.qBW, 0)} m³/h</dd>
            <dt>{t('pH / turbidez / Mn')}</dt><dd>{fmt(pl.pH16, 2)} / {fmt(pl.c16.turb, 2)} NTU / {fmt(pl.c16.mn, 3)} mg/L</dd>
            <dt>{t('H₂SO₄ (por otros)')}</dt><dd>{fmt(pl.frontera.acido16Lh, 1)} L/h</dd>
          </dl>
        </Seccion>
        {eq && <Seccion titulo={t('Ficha técnica')}><Ficha datos={eq} excluir={['tag']} /></Seccion>}
      </>
    );
  }
  const regen = tag === '16045-TK-30038';
  const v = regen ? pl.vRegen : tag === '16045-TK-30039' ? pl.vTK39 : NaN;
  const cap = regen ? e.params.sump_regen_m3 : e.params.tk39_m3;
  return (
    <>
      <div className="note">{t('Equipo por otros: se simula como frontera con capacidad y evacuación supuestas.')}</div>
      {Number.isFinite(v) && (
        <dl className="kv">
          <dt>{t('Volumen')}</dt><dd>{fmt(v, 1)} / {cap} m³ ({fmt((100 * v) / cap, 0)} %)</dd>
          {regen ? <><dt>{t('Cloro libre')}</dt><dd>{fmt(pl.clRegen, 1)} mg/L</dd><dt>{t('Evacuación por otros')}</dt><dd>{pl.frontera.evacRegen ? t('en marcha') : t('parada')}</dd></>
            : <><dt>{t('Turbidez')}</dt><dd>{fmt(pl.turbTK39, 0)} NTU</dd><dt>{t('PU-30161/62 (por otros)')}</dt><dd>{pl.frontera.evacBW ? t('en marcha') : t('paradas')}</dd></>}
        </dl>
      )}
      {tag === 'FILTERED-WATER-SUMP' && (
        <dl className="kv">
          <dt>{t('Agua filtrada')}</dt><dd>{fmt(pl.qFiltrada, 0)} m³/h</dd>
          <dt>Bypass</dt><dd>{fmt(pl.qBypass, 0)} m³/h</dd>
          <dt>{t('Total a TK-30016')}</dt><dd>{fmt(pl.qSumidero, 0)} m³/h</dd>
        </dl>
      )}
      {eq && <Seccion titulo={t('Ficha técnica')}><Ficha datos={eq} excluir={['tag']} /></Seccion>}
    </>
  );
}

function FaceExterno({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((s) => s.accion);
  const fr = e.planta.frontera;
  const pl = e.planta;
  const bw = tag.includes('30407');
  const regen = tag.includes('30169');
  const naocl = tag.includes('30236');
  const rel = tag.includes('30088');
  const eq = equipoPorTag(bw ? '16045-PU-30407/30408' : regen ? '16045-PU-30169/30170' : naocl ? '16045-PU-30236/30237' : tag);
  return (
    <>
      <div className="note">{t('Equipo por otros: bomba ideal que entrega el caudal nominal cuando el PCS la pide.')}</div>
      <dl className="kv">
        {bw && <><dt>{t('Pedido (paso 10)')}</dt><dd>{e.io.leerSalida('EXT-PU-30407-08-REQ') ? t('sí') : t('no')}</dd><dt>{t('Caudal')}</dt><dd>{fmt(fr.qBW, 0)} m³/h</dd><dt>{t('Disparo E12 (LALL TK-30016)')}</dt><dd>{e.plc.disparo('E12') ? t('ACTIVO') : t('no')}</dd></>}
        {regen && <><dt>{t('Pedido (pasos 12–13)')}</dt><dd>{e.io.leerSalida('EXT-PU-30169-70-REQ') ? t('sí') : t('no')}</dd><dt>{t('Caudal')}</dt><dd>{fmt(fr.qRegen, 0)} m³/h</dd><dt>{t('Nivel TK-30038')}</dt><dd>{fmt((100 * pl.vRegen) / e.params.sump_regen_m3, 0)} %</dd></>}
        {naocl && <><dt>{t('Pedido (paso 13)')}</dt><dd>{e.io.leerSalida('EXT-PU-30236-37-REQ') ? t('sí') : t('no')}</dd><dt>{t('Dosis NaOCl 12.5 %')}</dt><dd>{fmt(fr.naoclLh, 0)} L/h</dd><dt>{t('Consumo acumulado')}</dt><dd>{fmt(pl.tot.naoclL, 0)} L</dd></>}
        {rel && <><dt>{t('Caudal de liberación')}</dt><dd>{fmt(fr.qLiberacion, 0)} m³/h</dd><dt>{t('SP nivel TK-30016')}</dt><dd>{e.params.tk16_SP_mm} mm</dd></>}
      </dl>
      {bw && <Toggle label={t('Bombas de retrolavado no disponibles')} valor={pl.fallas.bombaRetrolavado} onChange={(v) => accion((en) => en.setFallaGlobal('bombaRetrolavado', v))} peligro />}
      {regen && <Toggle label={t('Bombas de regeneración no disponibles')} valor={pl.fallas.bombaRegeneracion} onChange={(v) => accion((en) => en.setFallaGlobal('bombaRegeneracion', v))} peligro />}
      {naocl && <Toggle label={t('Bombas de NaOCl no disponibles')} valor={pl.fallas.bombaNaOCl} onChange={(v) => accion((en) => en.setFallaGlobal('bombaNaOCl', v))} peligro />}
      {eq && <Seccion titulo={t('Ficha técnica')}><Ficha datos={eq} excluir={['tag']} /></Seccion>}
    </>
  );
}

export function Faceplate() {
  const e = useEngine();
  const sel = useSim((s) => s.seleccion);
  const seleccionar = useSim((s) => s.seleccionar);
  if (!sel) return null;
  let titulo = '';
  let sub = '';
  let cuerpo: ReactNode = null;
  switch (sel.tipo) {
    case 'motor':
      titulo = sel.tag;
      sub = td(equipoPorTag(sel.tag)?.nombre);
      cuerpo = <FaceMotor e={e} tag={sel.tag} />;
      break;
    case 'valvula':
      titulo = sel.tag;
      sub = td(valvulaPorTag(sel.tag)?.descripcion);
      cuerpo = <FaceValvula e={e} tag={sel.tag} />;
      break;
    case 'manual':
      titulo = sel.tag;
      sub = td(valvulaPorTag(sel.tag)?.descripcion);
      cuerpo = <FaceManual e={e} tag={sel.tag} />;
      break;
    case 'instrumento':
      titulo = sel.tag;
      sub = td(instrumentoPorTag(sel.tag)?.servicio ?? (e.io.tiene(sel.tag) ? e.io.punto(sel.tag).descripcion : ''));
      cuerpo = <FaceInstrumento e={e} tag={sel.tag} />;
      break;
    case 'fic':
      titulo = 'FIC/FY/FV-160305603';
      sub = t('Control de bypass TK-30015 → sumidero de agua filtrada');
      cuerpo = <FaceFIC e={e} />;
      break;
    case 'tanque':
      titulo = sel.tag;
      sub = td(equipoPorTag(sel.tag)?.nombre);
      cuerpo = <FaceTanque e={e} tag={sel.tag} />;
      break;
    case 'externo':
      titulo = sel.tag;
      sub = t('Por otros');
      cuerpo = <FaceExterno e={e} tag={sel.tag} />;
      break;
  }
  return (
    <aside className="drawer" aria-label={`Faceplate ${titulo}`}>
      <div className="drawer-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{titulo}</h2>
          <div className="muted" style={{ fontSize: '0.86rem' }}>{sub}</div>
        </div>
        <button className="btn" onClick={() => seleccionar(null)} aria-label={t('Cerrar faceplate')}>{t('Cerrar')}</button>
      </div>
      <div className="drawer-body">{cuerpo}</div>
    </aside>
  );
}

export const filtroDeValvula = (tag: string) => filtrosEquipo.findIndex((f) => Object.values(f.valvulas).includes(tag));
