import { useState } from 'react';
import { causaEfecto } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import { tiempoSim, fmt } from '../common/util';

type Vista = 'activas' | 'historial' | 'ce' | 'todas';

export function Alarmas() {
  const e = useEngine();
  const cmd = useSim((s) => s.cmd);
  const [vista, setVista] = useState<Vista>('activas');
  const A = e.plc.alarmas;
  const resumen = A.resumen.sort((a, b) => {
    const pr = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    return Number(a.reconocida) - Number(b.reconocida) || pr[a.def.prioridad] - pr[b.def.prioridad] || (b.tActivacion ?? 0) - (a.tActivacion ?? 0);
  });
  const efectos = Object.keys(causaEfecto.efectos);
  const disparosActivos = Object.values(e.plc.disparos).filter((d) => d.activo);
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Alarmas y causa-efecto</h2>
        <div className="seg" role="tablist" aria-label="Vista">
          {([['activas', `Activas (${resumen.length})`], ['historial', 'Historial'], ['ce', `Causa-efecto${disparosActivos.length ? ` (${disparosActivos.length})` : ''}`], ['todas', 'Configuradas']] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => setVista(k)}>{t}</button>
          ))}
        </div>
        <button className="btn" onClick={() => cmd({ tipo: 'ack_todas' })}>Reconocer todas</button>
        <button className="btn primary" onClick={() => cmd({ tipo: 'reset_disparos' })}>Reset de disparos</button>
      </div>

      {vista === 'activas' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Prioridad</th><th>Alarma</th><th>Descripción</th><th>Estado</th><th className="n">Valor</th><th>Activación</th><th /></tr></thead>
            <tbody>
              {resumen.length === 0 && <tr><td colSpan={7} className="empty">No hay alarmas activas ni pendientes de reconocer.</td></tr>}
              {resumen.map((a) => (
                <tr key={a.def.id}>
                  <td><span className={`prio ${a.def.prioridad}`}>{a.def.prioridad}</span></td>
                  <td className="mono">{a.def.id}</td>
                  <td>{a.def.texto}</td>
                  <td>{a.activa ? (a.reconocida ? 'Activa · reconocida' : <b>Activa · sin reconocer</b>) : 'Normalizada · sin reconocer'}</td>
                  <td className="n">{a.valor !== undefined ? fmt(a.valor, 1) : ''}</td>
                  <td className="mono">{a.tActivacion !== null ? tiempoSim(a.tActivacion) : ''}</td>
                  <td>{!a.reconocida && <button className="btn small" onClick={() => cmd({ tipo: 'ack', id: a.def.id })}>Reconocer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'historial' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Tiempo</th><th>Evento</th><th>Alarma</th><th>Descripción</th></tr></thead>
            <tbody>
              {[...A.historial].reverse().slice(0, 500).map((h, k) => (
                <tr key={k}>
                  <td className="mono">{tiempoSim(h.t)}</td>
                  <td>{h.evento === 'ACTIVA' ? <span className={`prio ${h.prioridad}`}>ACTIVA</span> : h.evento}</td>
                  <td className="mono">{h.id}</td>
                  <td>{h.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'ce' && (
        <div className="stack">
          <div className="note">
            Matriz {causaEfecto.fuente}. T = disparo enclavado hasta reset del operador · X = inicia acción. Celda roja = efecto disparado; fondo rosado = causa activa. {causaEfecto.nota}
          </div>
          <div className="scroll-x card">
            <table className="t ce">
              <thead>
                <tr><th>Causa</th>{efectos.map((ef) => <th key={ef} title={causaEfecto.efectos[ef]}>{ef}</th>)}</tr>
              </thead>
              <tbody>
                {causaEfecto.causas.map((c) => {
                  const id = c.causa.split(' ')[0];
                  const activa = A.activa(id);
                  return (
                    <tr key={c.causa}>
                      <td style={{ textAlign: 'left', fontFamily: 'var(--font-ui)' }} className={activa ? 'on-cause' : ''}>{c.causa}</td>
                      {efectos.map((ef) => {
                        const v = c.efectos[ef] ?? (ef === 'E6-E9' ? (['E6', 'E7', 'E8', 'E9'].map((x) => c.efectos[x]).find(Boolean) ?? '') : '');
                        const disp = v === 'T' && e.plc.disparos[ef]?.activo && e.plc.disparos[ef]?.causa === c.causa;
                        return <td key={ef} className={disp ? 'tripped' : activa && v ? 'on-cause' : ''}>{v}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Efectos</h3>
            <table className="t">
              <thead><tr><th>Efecto</th><th>Acción</th><th>Estado</th><th>Causa</th><th>Desde</th></tr></thead>
              <tbody>
                {Object.entries(causaEfecto.efectos).map(([ef, txt]) => {
                  const d = e.plc.disparos[ef];
                  return (
                    <tr key={ef}>
                      <td className="mono">{ef}</td>
                      <td>{txt}</td>
                      <td>{d ? (d.activo ? <span className="pill trip">Disparado</span> : <span className="pill on">Normal</span>) : <span className="pill info">Acción X</span>}</td>
                      <td>{d?.causa ?? ''}</td>
                      <td className="mono">{d?.t !== null && d?.t !== undefined ? tiempoSim(d.t) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vista === 'todas' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>Alarma</th><th>Descripción</th><th>Prioridad</th><th>Grupo</th><th className="n">Retardo</th><th>Estado</th><th>Fuente</th></tr></thead>
            <tbody>
              {[...A.estados.values()].map((a) => (
                <tr key={a.def.id}>
                  <td className="mono">{a.def.id}</td>
                  <td>{a.def.texto}</td>
                  <td><span className={`prio ${a.def.prioridad}`}>{a.def.prioridad}</span></td>
                  <td>{a.def.grupo}</td>
                  <td className="n">{a.def.retardo} s</td>
                  <td>{a.activa ? 'ACTIVA' : a.inhibida ? 'inhibida' : 'normal'}</td>
                  <td className="dim" style={{ fontSize: '0.78rem' }}>{a.def.fuente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
