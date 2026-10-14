import { useMemo, useState } from 'react';
import { senales } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import { esAnalogica, esEntrada, type PuntoIO } from '../../sim/io/iotable';
import { rangoAI } from '../../sim/params';
import type { Engine } from '../../sim/engine';
import { fmt } from '../common/util';
import { t, td, ts } from '../../i18n';

/** Descripción del punto: las de interfaz con otros las define la simulación (iotable.ts); el resto vienen de los JSON. */
const descTxt = (p: PuntoIO) => (p.grupo === 'otros' ? ts(p.descripcion) : td(p.descripcion));

function valorTexto(e: Engine, p: PuntoIO) {
  if (p.tipo === 'AI' || p.tipo === 'AO') return `${fmt(e.io.euVisible(p), 1)} ${p.unidad ?? (p.tipo === 'AO' ? '%' : '')}`;
  if (p.tipo === 'COM-AI') return `${fmt(e.io.valor(p.tag), 1)} ${p.unidad ?? ''}`;
  return e.io.valor(p.tag) >= 0.5 ? '1' : '0';
}

function EditorForzado({ e, p, onClose }: { e: Engine; p: PuntoIO; onClose: () => void }) {
  const accion = useSim((s) => s.accion);
  const analog = esAnalogica(p.tipo);
  const [v, setV] = useState(analog ? String(Math.round(e.io.euVisible(p) * 10) / 10) : '1');
  const rango = p.tipo === 'AO' ? [0, 100] : rangoAI(p.tag, e.params);
  const aplicar = () => {
    accion((en) => {
      const n = Number(v);
      if (p.tipo === 'AI' || p.tipo === 'AO') en.io.forzar(p.tag, 4 + (16 * (n - rango[0])) / (rango[1] - rango[0]));
      else en.io.forzar(p.tag, n);
    });
    onClose();
  };
  return (
    <span className="row" style={{ gap: 4 }}>
      {analog ? (
        <input type="number" id={`fz-${p.tag}`} value={v} onChange={(ev) => setV(ev.target.value)} aria-label={t('Valor forzado {tag}', { tag: p.tag })} />
      ) : (
        <select id={`fz-${p.tag}`} value={v} onChange={(ev) => setV(ev.target.value)} aria-label={t('Valor forzado {tag}', { tag: p.tag })}>
          <option value="1">1</option>
          <option value="0">0</option>
        </select>
      )}
      <button className="btn small primary" onClick={aplicar}>{t('Forzar')}</button>
      <button className="btn small" onClick={onClose}>{t('Cancelar')}</button>
    </span>
  );
}

export function ListaIO() {
  const e = useEngine();
  const accion = useSim((s) => s.accion);
  const seleccionar = useSim((s) => s.seleccionar);
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [grupo, setGrupo] = useState('todos');
  const [editando, setEditando] = useState<string | null>(null);
  const puntos = e.io.puntos;
  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return puntos.filter((p) =>
      (tipo === 'todos' || p.tipo === tipo || (tipo === 'COM' && p.tipo.startsWith('COM'))) &&
      (grupo === 'todos' || p.grupo === grupo) &&
      (!qq || p.tag.toLowerCase().includes(qq) || p.descripcion.toLowerCase().includes(qq) || descTxt(p).toLowerCase().includes(qq) || (p.equipo ?? '').toLowerCase().includes(qq)),
    );
  }, [puntos, q, tipo, grupo]);
  const cuenta = (t: string) => puntos.filter((p) => p.grupo === 'documentada' && p.tipo === t).length;
  const forzados = e.io.forzados.length;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Lista de I/O en vivo')}</h2>
        <p>
          {t('I/O list rev003: {ai} AI · {ao} AO · {di} DI · {do} DO ({n} puntos) + señales de motor (MPR) + interfaz con otros sistemas.', {
            ai: cuenta('AI'),
            ao: cuenta('AO'),
            di: cuenta('DI'),
            do: cuenta('DO'),
            n: senales.resumen.AI + senales.resumen.AO + senales.resumen.DI + senales.resumen.DO,
          })}{' '}
          {t('Un forzado reemplaza lo que ve el destino: el PLC para entradas, el campo para salidas.')}
        </p>
      </div>
      <div className="row">
        <input type="search" id="io-buscar" placeholder={t('Buscar tag, descripción o equipo')} value={q} onChange={(ev) => setQ(ev.target.value)} style={{ flex: '1 1 220px' }} />
        <select id="io-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)} aria-label={t('Tipo de señal')}>
          {['todos', 'AI', 'AO', 'DI', 'DO', 'DI(com)', 'COM'].map((x) => <option key={x} value={x}>{x === 'todos' ? t('Todos los tipos') : x}</option>)}
        </select>
        <select id="io-grupo" value={grupo} onChange={(ev) => setGrupo(ev.target.value)} aria-label={t('Grupo')}>
          <option value="todos">{t('Todos los grupos')}</option>
          <option value="documentada">{t('I/O list documentada')}</option>
          <option value="motor">{t('Señales de motor')}</option>
          <option value="otros">{t('Interfaz con otros')}</option>
        </select>
        <span className="muted">{t('{n} puntos', { n: filtrados.length })}</span>
        {forzados > 0 && <span className="pill forced">{t('{n} forzados', { n: forzados })}</span>}
        <button className="btn" disabled={!forzados} onClick={() => accion((en) => en.io.liberarTodo())}>{t('Liberar todos')}</button>
      </div>
      <div className="tbl-wrap">
        <table className="t">
          <thead>
            <tr><th>Tag</th><th>{t('Descripción')}</th><th>{t('Tipo')}</th><th>RIO</th><th>{t('Equipo')}</th><th className="n">{t('Valor')}</th><th className="n">mA</th><th>{t('Forzado')}</th></tr>
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const mA = p.tipo === 'AI' || p.tipo === 'AO' ? e.io.valor(p.tag) : NaN;
              const malo = p.tipo === 'AI' && (mA < 3.6 || mA > 21);
              const esInst = p.tipo === 'AI' || p.tipo === 'COM-AI';
              const esValv = p.tipo === 'DO' && p.tag.startsWith('HV-');
              return (
                <tr key={p.tag} className={p.forzado ? 'forz' : ''}>
                  <td className="mono">
                    {esInst || esValv ? (
                      <button className="btn small" style={{ fontFamily: 'var(--font-data)' }} onClick={() => seleccionar(esInst ? { tipo: 'instrumento', tag: p.tag } : { tipo: 'valvula', tag: p.tag })}>{p.tag}</button>
                    ) : p.tag}
                  </td>
                  <td>{descTxt(p)}</td>
                  <td><span className="tagchip">{p.tipo}</span> <span className="dim" style={{ fontSize: '0.75rem' }}>{esEntrada(p.tipo) ? t('entrada') : t('salida')}</span></td>
                  <td className="mono">{p.rio ?? ''}</td>
                  <td className="mono" style={{ fontSize: '0.78rem' }}>{p.equipo ?? ''}</td>
                  <td className="n" style={{ color: malo ? 'var(--trip)' : undefined }}>{malo ? 'BAD' : valorTexto(e, p)}</td>
                  <td className="n">{Number.isFinite(mA) ? fmt(mA, 2) : ''}</td>
                  <td>
                    {editando === p.tag ? (
                      <EditorForzado e={e} p={p} onClose={() => setEditando(null)} />
                    ) : p.forzado ? (
                      <span className="row" style={{ gap: 4 }}><span className="pill forced">F</span><button className="btn small" onClick={() => accion((en) => en.io.liberar(p.tag))}>{t('Liberar')}</button></span>
                    ) : (
                      <button className="btn small" onClick={() => setEditando(p.tag)}>{t('Forzar…')}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
