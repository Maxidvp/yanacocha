import { useState } from 'react';
import { causaEfecto } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import { tiempoSim, fmt, grupoTxt } from '../common/util';
import { t, td, ts } from '../../i18n';
import type { EventoAlarma, Prioridad } from '../../sim/plc/alarms';

type Vista = 'activas' | 'historial' | 'ce' | 'todas';

// Textos mostrados (en español: clave de t()); la clase CSS sigue usando el valor original.
const PRIO_TXT: Record<Prioridad, string> = { ALTA: 'ALTA', MEDIA: 'MEDIA', BAJA: 'BAJA' };
const EVENTO_TXT: Record<EventoAlarma['evento'], string> = { ACTIVA: 'ACTIVA', NORMAL: 'NORMAL', RECONOCIDA: 'RECONOCIDA', INFO: 'INFO' };

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
        <h2>{t('Alarmas y causa-efecto')}</h2>
        <div className="seg" role="tablist" aria-label={t('Vista')}>
          {([['activas', t('Activas ({n})', { n: resumen.length })], ['historial', t('Historial')], ['ce', `${t('Causa-efecto')}${disparosActivos.length ? ` (${disparosActivos.length})` : ''}`], ['todas', t('Configuradas')]] as const).map(([k, txt]) => (
            <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => setVista(k)}>{txt}</button>
          ))}
        </div>
        <button className="btn" onClick={() => cmd({ tipo: 'ack_todas' })}>{t('Reconocer todas')}</button>
        <button className="btn primary" onClick={() => cmd({ tipo: 'reset_disparos' })}>{t('Reset de disparos')}</button>
      </div>

      {vista === 'activas' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>{t('Prioridad')}</th><th>{t('Alarma')}</th><th>{t('Descripción')}</th><th>{t('Estado')}</th><th className="n">{t('Valor')}</th><th>{t('Activación')}</th><th /></tr></thead>
            <tbody>
              {resumen.length === 0 && <tr><td colSpan={7} className="empty">{t('No hay alarmas activas ni pendientes de reconocer.')}</td></tr>}
              {resumen.map((a) => (
                <tr key={a.def.id}>
                  <td><span className={`prio ${a.def.prioridad}`}>{t(PRIO_TXT[a.def.prioridad])}</span></td>
                  <td className="mono">{a.def.id}</td>
                  <td>{ts(a.def.texto)}</td>
                  <td>{a.activa ? (a.reconocida ? t('Activa · reconocida') : <b>{t('Activa · sin reconocer')}</b>) : t('Normalizada · sin reconocer')}</td>
                  <td className="n">{a.valor !== undefined ? fmt(a.valor, 1) : ''}</td>
                  <td className="mono">{a.tActivacion !== null ? tiempoSim(a.tActivacion) : ''}</td>
                  <td>{!a.reconocida && <button className="btn small" onClick={() => cmd({ tipo: 'ack', id: a.def.id })}>{t('Reconocer')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'historial' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>{t('Tiempo')}</th><th>{t('Evento')}</th><th>{t('Alarma')}</th><th>{t('Descripción')}</th></tr></thead>
            <tbody>
              {[...A.historial].reverse().slice(0, 500).map((h, k) => (
                <tr key={k}>
                  <td className="mono">{tiempoSim(h.t)}</td>
                  <td>{h.evento === 'ACTIVA' ? <span className={`prio ${h.prioridad}`}>{t(EVENTO_TXT.ACTIVA)}</span> : t(EVENTO_TXT[h.evento])}</td>
                  <td className="mono">{h.id}</td>
                  <td>{ts(h.texto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'ce' && (
        <div className="stack">
          <div className="note">
            <span className="pill on">{t('Verificada')}</span> {td(causaEfecto.fuente)}. {td(causaEfecto.estado)} {t('T = disparo enclavado hasta reset del operador · X = inicia acción. Celda roja = efecto disparado; fondo rosado = causa activa.')}
          </div>
          <div className="scroll-x card">
            <table className="t ce">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Causa')}</th>
                  <th>{t('Instrumento')}</th>
                  <th>{t('Alarma (impresa)')}</th>
                  {efectosCols.map((ef) => (
                    <th key={ef} title={`${td(causaEfecto.efectos_detalle[ef]?.descripcion_original)} · ${causaEfecto.efectos_detalle[ef]?.tag}`} style={{ textAlign: 'center' }}>
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
                        {td(c.causa).replace(id, '').trim()}
                        {c.nota && <div className="dim" style={{ fontSize: '0.74rem' }}>{td(c.nota)}</div>}
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
            <h3>{t('Efectos')}</h3>
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>#</th><th>{t('Efecto (original)')}</th><th>Tag</th><th>P&amp;ID</th><th>{t('Estado')}</th><th>{t('Causa')}</th><th>{t('Desde')}</th></tr></thead>
                <tbody>
                  {efectosCols.map((ef) => {
                    const det = causaEfecto.efectos_detalle[ef];
                    const d = e.plc.disparos[ef];
                    return (
                      <tr key={ef}>
                        <td className="mono">{det?.columna}</td>
                        <td>
                          {td(det?.descripcion_original)}
                          {det?.nota && <div style={{ fontSize: '0.74rem' }}>{/A CONFIRMAR|errata probable/i.test(det.nota) ? <span className="badge A_CONFIRMAR">{t('A confirmar')}</span> : <span className="badge DOC">{t('Errata')}</span>} {td(det.nota)}</div>}
                        </td>
                        <td className="mono" style={{ fontSize: '0.8rem' }}>{det?.tag}</td>
                        <td className="dim" style={{ fontSize: '0.78rem' }}>{td(det?.pid)}</td>
                        <td>{d ? (d.activo ? <span className="pill trip">{t('Disparado')}</span> : <span className="pill on">{t('Normal')}</span>) : <span className="pill info">{t('Acción X')}</span>}</td>
                        <td>{ts(d?.causa)}</td>
                        <td className="mono">{d?.t !== null && d?.t !== undefined ? tiempoSim(d.t) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="note" style={{ marginTop: 6 }}>{td(causaEfecto.nota)}</div>
          </div>
        </div>
      )}

      {vista === 'todas' && (
        <div className="tbl-wrap">
          <table className="t">
            <thead><tr><th>{t('Alarma')}</th><th>{t('Descripción')}</th><th>{t('Prioridad')}</th><th>{t('Grupo')}</th><th className="n">{t('Retardo')}</th><th>{t('Estado')}</th><th>{t('Fuente')}</th></tr></thead>
            <tbody>
              {[...A.estados.values()].map((a) => (
                <tr key={a.def.id}>
                  <td className="mono">{a.def.id}</td>
                  <td>{ts(a.def.texto)}</td>
                  <td><span className={`prio ${a.def.prioridad}`}>{t(PRIO_TXT[a.def.prioridad])}</span></td>
                  <td>{grupoTxt(a.def.grupo)}</td>
                  <td className="n">{a.def.retardo} s</td>
                  <td>{a.activa ? t('ACTIVA') : a.inhibida ? t('inhibida') : t('normal')}</td>
                  <td className="dim" style={{ fontSize: '0.78rem' }}>{ts(a.def.fuente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
