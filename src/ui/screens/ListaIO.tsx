import { useMemo, useState } from 'react';
import { senales } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import { esAnalogica, esEntrada, type PuntoIO } from '../../sim/io/iotable';
import { rangoAI } from '../../sim/params';
import type { Engine } from '../../sim/engine';
import { fmt } from '../common/util';

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
        <input type="number" id={`fz-${p.tag}`} value={v} onChange={(ev) => setV(ev.target.value)} aria-label={`Valor forzado ${p.tag}`} />
      ) : (
        <select id={`fz-${p.tag}`} value={v} onChange={(ev) => setV(ev.target.value)} aria-label={`Valor forzado ${p.tag}`}>
          <option value="1">1</option>
          <option value="0">0</option>
        </select>
      )}
      <button className="btn small primary" onClick={aplicar}>Forzar</button>
      <button className="btn small" onClick={onClose}>Cancelar</button>
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
      (!qq || p.tag.toLowerCase().includes(qq) || p.descripcion.toLowerCase().includes(qq) || (p.equipo ?? '').toLowerCase().includes(qq)),
    );
  }, [puntos, q, tipo, grupo]);
  const cuenta = (t: string) => puntos.filter((p) => p.grupo === 'documentada' && p.tipo === t).length;
  const forzados = e.io.forzados.length;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Lista de I/O en vivo</h2>
        <p>
          I/O list rev003: {cuenta('AI')} AI · {cuenta('AO')} AO · {cuenta('DI')} DI · {cuenta('DO')} DO ({senales.resumen.AI + senales.resumen.AO + senales.resumen.DI + senales.resumen.DO} puntos) + señales de motor (MPR) + interfaz con otros sistemas.
          Un forzado reemplaza lo que ve el destino: el PLC para entradas, el campo para salidas.
        </p>
      </div>
      <div className="row">
        <input type="search" id="io-buscar" placeholder="Buscar tag, descripción o equipo" value={q} onChange={(ev) => setQ(ev.target.value)} style={{ flex: '1 1 220px' }} />
        <select id="io-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)} aria-label="Tipo de señal">
          {['todos', 'AI', 'AO', 'DI', 'DO', 'DI(com)', 'COM'].map((t) => <option key={t} value={t}>{t === 'todos' ? 'Todos los tipos' : t}</option>)}
        </select>
        <select id="io-grupo" value={grupo} onChange={(ev) => setGrupo(ev.target.value)} aria-label="Grupo">
          <option value="todos">Todos los grupos</option>
          <option value="documentada">I/O list documentada</option>
          <option value="motor">Señales de motor</option>
          <option value="otros">Interfaz con otros</option>
        </select>
        <span className="muted">{filtrados.length} puntos</span>
        {forzados > 0 && <span className="pill forced">{forzados} forzados</span>}
        <button className="btn" disabled={!forzados} onClick={() => accion((en) => en.io.liberarTodo())}>Liberar todos</button>
      </div>
      <div className="tbl-wrap">
        <table className="t">
          <thead>
            <tr><th>Tag</th><th>Descripción</th><th>Tipo</th><th>RIO</th><th>Equipo</th><th className="n">Valor</th><th className="n">mA</th><th>Forzado</th></tr>
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
                  <td>{p.descripcion}</td>
                  <td><span className="tagchip">{p.tipo}</span> <span className="dim" style={{ fontSize: '0.75rem' }}>{esEntrada(p.tipo) ? 'entrada' : 'salida'}</span></td>
                  <td className="mono">{p.rio ?? ''}</td>
                  <td className="mono" style={{ fontSize: '0.78rem' }}>{p.equipo ?? ''}</td>
                  <td className="n" style={{ color: malo ? 'var(--trip)' : undefined }}>{malo ? 'BAD' : valorTexto(e, p)}</td>
                  <td className="n">{Number.isFinite(mA) ? fmt(mA, 2) : ''}</td>
                  <td>
                    {editando === p.tag ? (
                      <EditorForzado e={e} p={p} onClose={() => setEditando(null)} />
                    ) : p.forzado ? (
                      <span className="row" style={{ gap: 4 }}><span className="pill forced">F</span><button className="btn small" onClick={() => accion((en) => en.io.liberar(p.tag))}>Liberar</button></span>
                    ) : (
                      <button className="btn small" onClick={() => setEditando(p.tag)}>Forzar…</button>
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
