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
  const efectosCols = Object.keys(causaEfecto.efectos_detalle);
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
            <span className="pill on">Verificada</span> {causaEfecto.fuente}. {causaEfecto.estado} T = disparo enclavado hasta reset del operador · X = inicia acción. Celda roja = efecto disparado; fondo rosado = causa activa.
          </div>
          <div className="scroll-x card">
            <table className="t ce">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Causa</th>
                  <th>Instrumento</th>
                  <th>Alarma (impresa)</th>
                  {efectosCols.map((ef) => (
                    <th key={ef} title={`${causaEfecto.efectos_detalle[ef]?.descripcion_original} · ${causaEfecto.efectos_detalle[ef]?.tag}`} style={{ textAlign: 'center' }}>
                      {causaEfecto.efectos_detalle[ef]?.columna ?? ef}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {causaEfecto.causas.map((c) => {
                  const id = c.causa.split(' ')[0];
                  const activa = A.activa(id);
                  return (
                    <tr key={c.linea}>
                      <td className="mono">{c.linea}</td>
                      <td style={{ textAlign: 'left', fontFamily: 'var(--font-ui)' }} className={activa ? 'on-cause' : ''}>
                        {c.causa.replace(id, '').trim()}
                        {c.nota && <div className="dim" style={{ fontSize: '0.74rem' }}>{c.nota}</div>}
                      </td>
                      <td className="mono" style={{ textAlign: 'left' }}>{c.instrumento}</td>
                      <td className="mono" style={{ textAlign: 'left' }}>
                        {c.alarma_impresa}
                        {c.alarma_impresa !== id && <div className="dim" style={{ fontSize: '0.72rem' }}>sim: {id}</div>}
                      </td>
                      {efectosCols.map((ef) => {
                        const v = c.efectos[ef] ?? '';
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
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>#</th><th>Efecto (original)</th><th>Tag</th><th>P&amp;ID</th><th>Estado</th><th>Causa</th><th>Desde</th></tr></thead>
                <tbody>
                  {efectosCols.map((ef) => {
                    const det = causaEfecto.efectos_detalle[ef];
                    const d = e.plc.disparos[ef];
                    return (
                      <tr key={ef}>
                        <td className="mono">{det?.columna}</td>
                        <td>
                          {det?.descripcion_original}
                          {det?.nota && <div style={{ fontSize: '0.74rem' }}>{/A CONFIRMAR|errata probable/i.test(det.nota) ? <span className="badge A_CONFIRMAR">A confirmar</span> : <span className="badge DOC">Errata</span>} {det.nota}</div>}
                        </td>
                        <td className="mono" style={{ fontSize: '0.8rem' }}>{det?.tag}</td>
                        <td className="dim" style={{ fontSize: '0.78rem' }}>{det?.pid}</td>
                        <td>{d ? (d.activo ? <span className="pill trip">Disparado</span> : <span className="pill on">Normal</span>) : <span className="pill info">Acción X</span>}</td>
                        <td>{d?.causa ?? ''}</td>
                        <td className="mono">{d?.t !== null && d?.t !== undefined ? tiempoSim(d.t) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="note" style={{ marginTop: 6 }}>{causaEfecto.nota}</div>
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
