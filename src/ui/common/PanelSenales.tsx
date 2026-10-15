// Panel de señales del elemento seleccionado (senales_por_equipo.json → mapa[tag]): agrupadas por tipo,
// con nombre lógico, tag de la I/O list, conexionado, valor en vivo, forzado y alarmas asociadas.
import { Fragment, useState } from 'react';
import { senalesDe, type SenalEquipo } from '../../data';
import { useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { EditorForzado, NombreLogico } from './Forzado';
import { fmt } from './util';
import { t, td } from '../../i18n';

type Grupo = 'AI' | 'AO' | 'DI' | 'DO' | 'COM' | 'ALIM' | 'LOCAL';
const ORDEN: Grupo[] = ['AI', 'AO', 'DI', 'DO', 'COM', 'ALIM', 'LOCAL'];
const TITULO: Record<Grupo, string> = { AI: 'Entradas analógicas (AI)', AO: 'Salidas analógicas (AO)', DI: 'Entradas digitales (DI)', DO: 'Salidas digitales (DO)', COM: 'Comunicación (MPR / Modbus TCP)', ALIM: 'Alimentación', LOCAL: 'Indicación local' };

function grupoDe(s: SenalEquipo): Grupo {
  if (s.tipo === 'AI' || s.tipo === 'AO' || s.tipo === 'DI' || s.tipo === 'DO') return s.tipo;
  if (s.tipo.startsWith('Alimentación')) return 'ALIM';
  if (s.tipo === 'Local') return 'LOCAL';
  return 'COM';
}

const esPropuesto = (s: SenalEquipo) => !!s.nombre_logico_propuesto || (typeof s.documentado === 'string' && /propuesto/i.test(s.documentado));

function bornesTxt(b: SenalEquipo['bornes']) {
  if (!b) return '';
  if (typeof b === 'string') return b;
  return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(' · ');
}

/** Texto de un 0/1 según la función de la señal. */
function textoDigital(tag: string, v: boolean) {
  const suf = tag.split('-').pop() ?? '';
  const m: Record<string, [string, string]> = {
    ZSO: ['abierta', 'no abierta'], ZSC: ['cerrada', 'no cerrada'], RUN: ['en marcha', 'parado'], AVL: ['disponible', 'no disponible'],
    CP: ['tensión OK', 'sin tensión'], FLT: ['falla', 'normal'], LOC: ['local', 'remoto'], START: ['pulso de arranque', '—'], STOP: ['pulso de parada', '—'],
  };
  const par = m[suf] ?? (tag.startsWith('HV-') && !tag.endsWith('-ZSO') && !tag.endsWith('-ZSC') ? ['abrir', 'cerrar'] : ['1', '0']);
  return t(v ? par[0] : par[1]);
}

/** Variables Modbus del controlador MK5 (sufijo A = CM-30011, B = CM-30012). */
function valorMK5(e: Engine, tag: string): string | null {
  const m = /^(PT|PDT|TT|HY)-1603057(\d\d)([AB])$/.exec(tag);
  if (!m) return null;
  const c = e.planta.compresores[m[3] === 'A' ? 0 : 1];
  const mot = c.motor;
  switch (m[2]) {
    case '11': return `${fmt(c.pDescarga, 1)} kPa`;
    case '01': return `${fmt(c.dpFiltro, 2)} kPa`;
    case '04': return `${fmt(c.pAceite, 0)} kPa`;
    case '03': return `${fmt(c.tDescarga, 1)} °C`;
    case '05': return `${fmt(c.tAceite, 1)} °C`;
    case '06': return `${fmt(mot.tempDevanado, 1)} °C`;
    case '07': return `${fmt(mot.tempDevanado + 1.2, 1)} °C`;
    case '08': return `${fmt(mot.tempDevanado - 0.8, 1)} °C`;
    case '09': return `${fmt(c.tRodLA, 1)} °C`;
    case '10': return `${fmt(c.tRodLOA, 1)} °C`;
    case '12': return c.estado === 'CARGA' ? t('CARGA') : t('DESCARGA');
  }
  return null;
}

function ValorVivo({ e, s }: { e: Engine; s: SenalEquipo }) {
  const g = grupoDe(s);
  const tag = s.tag_io;
  if (g === 'ALIM') return <span className={`pill ${e.planta.alimPK30005 ? 'on' : 'trip'}`}>{e.planta.alimPK30005 ? t('alimentado') : t('sin tensión')}</span>;
  if (g === 'LOCAL') return <span className="dim">{t('local')}</span>;
  const mk5 = valorMK5(e, tag);
  if (mk5 !== null) return <span className="mono">{mk5}</span>;
  if (!e.io.tiene(tag)) return <span className="dim">—</span>;
  const p = e.io.punto(tag);
  if (p.tipo === 'AI') {
    const pv = e.plc.pv[tag] ?? e.io.ai(tag);
    if (pv.mala) return <span className="mono" style={{ color: 'var(--trip)' }}>BAD · {fmt(pv.mA, 2)} mA</span>;
    return <span className="mono">{fmt(pv.eu, 1)} {p.unidad ?? s.unidad ?? ''} · {fmt(pv.mA, 2)} mA</span>;
  }
  if (p.tipo === 'AO') return <span className="mono">{fmt(e.io.euVisible(p), 1)} % · {fmt(e.io.valor(tag), 2)} mA</span>;
  const v = e.io.valor(tag) >= 0.5;
  return <span className="mono">{v ? 1 : 0} <span className="dim">{textoDigital(tag, v)}</span></span>;
}

/** Alarmas asociadas a la señal: HH/H/L/LL de las AI y ZAO/ZAC de los finales de carrera; FTS/FLT/CP de motores. */
function idsAlarma(e: Engine, s: SenalEquipo): string[] {
  const tag = s.tag_io;
  const ids: string[] = [];
  if (s.tipo === 'AI') {
    const suf = tag.split('-')[1];
    for (const n of ['HH', 'H', 'L', 'LL']) ids.push(`${tag[0]}A${n}-${suf}`);
    ids.push(`${tag}-BAD`);
  } else if (tag.endsWith('-ZSO')) ids.push(`ZAO-${tag.replace(/^HV-/, '').replace(/-ZSO$/, '')}`);
  else if (tag.endsWith('-ZSC')) ids.push(`ZAC-${tag.replace(/^HV-/, '').replace(/-ZSC$/, '')}`);
  else {
    const m = /^(16045-\w+-\d+)-(RUN|START|FLT|CP)$/.exec(tag);
    if (m) ids.push(m[2] === 'RUN' || m[2] === 'START' ? `${m[1]}-FTS` : `${m[1]}-${m[2]}`);
  }
  return ids.filter((id) => e.plc.alarmas.estados.has(id));
}

function Alarmas({ e, s }: { e: Engine; s: SenalEquipo }) {
  const ids = idsAlarma(e, s);
  if (!ids.length) return null;
  return (
    <span className="row" style={{ gap: 3 }}>
      {ids.map((id) => {
        const st = e.plc.alarmas.estados.get(id)!;
        return (
          <span key={id} className={`pill ${st.activa ? 'trip' : 'unk'}`} title={id} style={{ fontSize: '0.7rem' }}>
            {id.endsWith('-BAD') ? 'BAD' : id.replace(/-\d{9}$/, '').replace(/^\d{5}-\w+-\d+-/, '')}
            {st.activa ? ' !' : ''}
          </span>
        );
      })}
    </span>
  );
}

export function PanelSenales({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((st) => st.accion);
  const [editando, setEditando] = useState<string | null>(null);
  const lista = senalesDe(tag);
  if (!lista.length) return null;
  const grupos = ORDEN.map((g) => [g, lista.filter((s) => grupoDe(s) === g)] as const).filter(([, l]) => l.length > 0);
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: '0.8rem' }}>{t('{n} señales · nombre lógico como identificador; tag de la I/O list debajo.', { n: lista.length })}</div>
      <div className="scroll-x">
        <table className="t senales">
          <thead>
            <tr><th>{t('Nombre lógico · tag I/O')}</th><th>{t('Descripción')}</th><th>RIO</th><th>{t('Caja / bornes / cable')}</th><th>{t('Valor')}</th><th>{t('Forzado')}</th><th>{t('Alarmas')}</th></tr>
          </thead>
          <tbody>
            {grupos.map(([g, l]) => (
              <Fragment key={g}>
                <tr className="grupo"><th colSpan={7}>{t(TITULO[g])}</th></tr>
                {l.map((s) => {
                  const nombre = s.nombre_logico ?? s.nombre_logico_propuesto ?? s.tag_io;
                  const enIO = e.io.tiene(s.tag_io);
                  const p = enIO ? e.io.punto(s.tag_io) : null;
                  return (
                    <tr key={`${g}-${s.tag_io}`} className={p?.forzado ? 'forz' : ''}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                        <NombreLogico nombre={nombre} propuesto={esPropuesto(s)} />
                        {nombre !== s.tag_io && <div className="dim" style={{ fontSize: '0.72rem' }}>{s.tag_io}</div>}
                      </td>
                      <td>{td(s.descripcion)}</td>
                      <td className="mono">{s.rio ?? ''}</td>
                      <td className="mono" style={{ fontSize: '0.72rem' }}>
                        {[s.caja, bornesTxt(s.bornes), s.cable].filter(Boolean).map((x, k) => <div key={k}>{x}</div>)}
                      </td>
                      <td><ValorVivo e={e} s={s} /></td>
                      <td>
                        {!p || p.tipo.startsWith('COM') ? null : editando === s.tag_io ? (
                          <EditorForzado e={e} p={p} onClose={() => setEditando(null)} />
                        ) : p.forzado ? (
                          <span className="row" style={{ gap: 4 }}><span className="pill forced">F</span><button className="btn small" onClick={() => accion((en) => en.io.liberar(s.tag_io))}>{t('Liberar')}</button></span>
                        ) : (
                          <button className="btn small" onClick={() => setEditando(s.tag_io)}>{t('Forzar…')}</button>
                        )}
                      </td>
                      <td><Alarmas e={e} s={s} /></td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
