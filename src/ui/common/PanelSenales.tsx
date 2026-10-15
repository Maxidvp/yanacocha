// Panel de señales del elemento seleccionado (senales_por_equipo.json → mapa[tag]): tipo, nombre lógico, tag de la
// I/O list y valor en vivo en cada fila; conexionado, alarmas asociadas y forzado al abrirla.
import { Fragment, useState, type ReactNode } from 'react';
import { senalesDe, type SenalEquipo } from '../../data';
import { useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { EditorForzado, NombreLogico } from './Forzado';
import { fmt } from './util';
import { t, td } from '../../i18n';

type Grupo = 'AI' | 'AO' | 'DI' | 'DO' | 'COM' | 'ALIM' | 'LOCAL';

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

/** Etiqueta corta del tipo de señal (AI/AO/DI/DO/COM…) y su clase de color. */
function tipoCorto(s: SenalEquipo): { txt: string; clase: string } {
  const m = /^(AI|AO|DI|DO)/.exec(s.tipo);
  if (m) return { txt: m[1], clase: m[1] };
  if (s.tipo.startsWith('Alimentación')) return { txt: t('ALIM'), clase: 'ALIM' };
  if (s.tipo === 'Local') return { txt: t('LOC'), clase: 'LOC' };
  return { txt: 'COM', clase: 'COM' };
}

/** Valor en vivo: principal (unidad de ingeniería, 0/1) y secundario (mA o texto del estado). */
function valorVivo(e: Engine, s: SenalEquipo): { v: ReactNode; sub?: ReactNode } {
  const g = grupoDe(s);
  const tag = s.tag_io;
  if (g === 'ALIM') return { v: <span className={`pill ${e.planta.alimPK30005 ? 'on' : 'trip'}`}>{e.planta.alimPK30005 ? t('alimentado') : t('sin tensión')}</span> };
  if (g === 'LOCAL') return { v: <span className="dim">{t('local')}</span> };
  const mk5 = valorMK5(e, tag);
  if (mk5 !== null) return { v: mk5, sub: 'Modbus' };
  if (!e.io.tiene(tag)) return { v: <span className="dim">—</span> };
  const p = e.io.punto(tag);
  if (p.tipo === 'AI') {
    const pv = e.plc.pv[tag] ?? e.io.ai(tag);
    if (pv.mala) return { v: <span style={{ color: 'var(--trip)' }}>BAD</span>, sub: `${fmt(pv.mA, 2)} mA` };
    return { v: `${fmt(pv.eu, 1)} ${p.unidad ?? s.unidad ?? ''}`.trim(), sub: `${fmt(pv.mA, 2)} mA` };
  }
  if (p.tipo === 'AO') return { v: `${fmt(e.io.euVisible(p), 1)} %`, sub: `${fmt(e.io.valor(tag), 2)} mA` };
  const on = e.io.valor(tag) >= 0.5;
  return { v: <><span className={`lampara${on ? ' on' : ''}`} />{on ? 1 : 0}</>, sub: textoDigital(tag, on) };
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

function Alarmas({ e, s, soloActivas = false }: { e: Engine; s: SenalEquipo; soloActivas?: boolean }) {
  const ids = idsAlarma(e, s).filter((id) => !soloActivas || e.plc.alarmas.estados.get(id)!.activa);
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

/** Señales del elemento en el orden del JSON (agrupadas por dispositivo): tipo, nombre lógico / tag y valor a la vista;
 *  descripción, conexionado, alarmas y forzado al abrir la fila. Pensado para el ancho de la barra lateral. */
export function PanelSenales({ e, tag }: { e: Engine; tag: string }) {
  const accion = useSim((st) => st.accion);
  const [editando, setEditando] = useState<string | null>(null);
  const lista = senalesDe(tag);
  if (!lista.length) return null;
  const cuenta = new Map<string, number>();
  for (const s of lista) cuenta.set(tipoCorto(s).txt, (cuenta.get(tipoCorto(s).txt) ?? 0) + 1);
  return (
    <div className="senal-lista">
      <div className="senal-resumen">
        {[...cuenta].map(([k, n]) => <span key={k} className="mono">{k} {n}</span>)}
        <span className="dim">{t('clic en una fila: conexionado, alarmas y forzado')}</span>
      </div>
      {lista.map((s, n) => {
        const nombre = s.nombre_logico ?? s.nombre_logico_propuesto ?? s.tag_io;
        const p = e.io.tiene(s.tag_io) ? e.io.punto(s.tag_io) : null;
        const tc = tipoCorto(s);
        const { v, sub } = valorVivo(e, s);
        const conex: [string, string | undefined][] = [['RIO', s.rio], [t('Caja'), s.caja], [t('Bornes'), bornesTxt(s.bornes)], [t('Cable'), s.cable]];
        return (
          <details key={`${s.tag_io}-${n}`} className={`senal${p?.forzado ? ' forz' : ''}`}>
            <summary>
              <span className={`tipo-io ${tc.clase}`} title={s.tipo}>{tc.txt}</span>
              <span className="senal-id">
                <span className="mono b"><NombreLogico nombre={nombre} propuesto={esPropuesto(s)} /></span>
                {nombre !== s.tag_io && <span className="mono dim">{s.tag_io}</span>}
              </span>
              <span className="senal-val">
                <span className="mono b">{v}</span>
                {sub && <span className="dim">{sub}</span>}
                {(p?.forzado || idsAlarma(e, s).some((id) => e.plc.alarmas.estados.get(id)!.activa)) && (
                  <span className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                    {p?.forzado && <span className="pill forced" style={{ fontSize: '0.7rem' }}>F</span>}
                    <Alarmas e={e} s={s} soloActivas />
                  </span>
                )}
              </span>
            </summary>
            <div className="senal-det">
              {s.descripcion && <div>{td(s.descripcion)}</div>}
              <dl className="kv">
                {conex.filter(([, x]) => x).map(([k, x]) => <Fragment key={k}><dt>{k}</dt><dd className="mono">{x}</dd></Fragment>)}
                {idsAlarma(e, s).length > 0 && <><dt>{t('Alarmas')}</dt><dd><Alarmas e={e} s={s} /></dd></>}
              </dl>
              {p && !p.tipo.startsWith('COM') && (editando === s.tag_io ? (
                <EditorForzado e={e} p={p} onClose={() => setEditando(null)} />
              ) : p.forzado ? (
                <span className="row" style={{ gap: 6 }}><span className="pill forced">{t('Forzado')}</span><button className="btn small" onClick={() => accion((en) => en.io.liberar(s.tag_io))}>{t('Liberar')}</button></span>
              ) : (
                <button className="btn small" onClick={() => setEditando(s.tag_io)}>{t('Forzar…')}</button>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
