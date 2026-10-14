import { useState } from 'react';
import { equipos, instrumentos, valvulas, electrico, type Json } from '../../data';
import faltantes from '../../../docs/FALTANTES.md?raw';
import faltantesEn from '../../../docs/FALTANTES.en.md?raw';
import { getIdioma, t, td } from '../../i18n';
import { useSim } from '../../store/sim';
import { Ficha } from '../Faceplate';

type Vista = 'equipos' | 'instrumentos' | 'valvulas' | 'cargas' | 'pendientes';

const tieneAC = (o: unknown) => JSON.stringify(o).match(/A CONFIRMAR|por Bechtel|incoherente|invertido/i) !== null;

function Markdown({ texto }: { texto: string }) {
  const lineas = texto.split('\n');
  return (
    <div className="stack" style={{ maxWidth: '85ch' }}>
      {lineas.map((l, k) => {
        if (l.startsWith('# ')) return <h2 key={k}>{l.slice(2)}</h2>;
        if (l.startsWith('## ')) return <h3 key={k} style={{ marginTop: 8 }}>{l.slice(3)}</h3>;
        if (/^\s*(-|\d+\.)\s/.test(l)) {
          const t = l.replace(/^\s*(-|\d+\.)\s/, '');
          const partes = t.split(/\*\*(.+?)\*\*/g);
          return <div key={k} style={{ paddingLeft: 14, textIndent: -10 }}>• {partes.map((p, j) => (j % 2 ? <b key={j}>{p}</b> : p))}</div>;
        }
        return l.trim() ? <p key={k} style={{ margin: 0 }}>{l}</p> : null;
      })}
    </div>
  );
}

export function Datos() {
  const seleccionar = useSim((s) => s.seleccionar);
  const [vista, setVista] = useState<Vista>('equipos');
  const [q, setQ] = useState('');
  const qq = q.trim().toLowerCase();
  const filtro = <T,>(arr: T[]) => (qq ? arr.filter((x) => JSON.stringify(x).toLowerCase().includes(qq)) : arr);
  const listas: Record<Exclude<Vista, 'pendientes'>, { tag: string; titulo: string; obj: Record<string, Json | undefined>; abrir?: () => void }[]> = {
    equipos: filtro(equipos).map((x) => ({ tag: x.tag, titulo: td(x.nombre), obj: x, abrir: x.tag.match(/AG|BL|CM/) ? () => seleccionar({ tipo: 'motor', tag: x.tag }) : x.tag.match(/TK-3001[56]/) ? () => seleccionar({ tipo: 'tanque', tag: x.tag }) : undefined })),
    instrumentos: filtro(instrumentos).map((x) => ({ tag: x.tag, titulo: td(String(x.servicio ?? x.tipo ?? '')), obj: x, abrir: () => seleccionar({ tipo: 'instrumento', tag: x.tag }) })),
    valvulas: filtro(valvulas).map((x) => ({ tag: x.tag, titulo: td(x.descripcion), obj: x, abrir: x.senales ? () => (x.tag.startsWith('FV') ? seleccionar({ tipo: 'fic' }) : seleccionar({ tipo: 'valvula', tag: x.tag })) : x.funcion === 'MANUAL' ? () => seleccionar({ tipo: 'manual', tag: x.tag }) : undefined })),
    cargas: filtro(electrico.cargas).map((x) => ({ tag: x.tag, titulo: td(x.desc), obj: x as unknown as Record<string, Json> })),
  };
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Fichas técnicas')}</h2>
        <div className="seg" role="tablist" aria-label={t('Tipo de dato')}>
          {([['equipos', t('Equipos ({n})', { n: equipos.length })], ['instrumentos', t('Instrumentos ({n})', { n: instrumentos.length })], ['valvulas', t('Válvulas ({n})', { n: valvulas.length })], ['cargas', t('Cargas ({n})', { n: electrico.cargas.length })], ['pendientes', t('Pendientes')]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => setVista(k)}>{t}</button>
          ))}
        </div>
        {vista !== 'pendientes' && <input type="search" id="datos-buscar" placeholder={t('Buscar')} value={q} onChange={(ev) => setQ(ev.target.value)} />}
      </div>
      {vista === 'pendientes' ? (
        <div className="card"><Markdown texto={getIdioma() === 'en' ? faltantesEn : faltantes} /></div>
      ) : (
        <div className="stack">
          {listas[vista].map((x) => (
            <details key={x.tag} className="card">
              <summary className="row" style={{ display: 'flex' }}>
                <span className="mono" style={{ fontWeight: 600 }}>{x.tag}</span>
                <span className="muted" style={{ flex: 1, minWidth: 0 }}>{x.titulo}</span>
                {tieneAC(x.obj) && <span className="badge A_CONFIRMAR">{t('A confirmar')}</span>}
              </summary>
              <div style={{ marginTop: 8 }} className="stack">
                <Ficha datos={x.obj} excluir={['tag']} />
                {x.abrir && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={x.abrir}>{t('Abrir faceplate en vivo')}</button>}
              </div>
            </details>
          ))}
          {listas[vista].length === 0 && <p className="empty">{t('Sin resultados para "{q}".', { q })}</p>}
        </div>
      )}
      {vista !== 'pendientes' && <div className="note">{t('Los valores provienen de los JSON del paquete (data/); la columna fuente indica el documento de origen.')}</div>}
    </div>
  );
}
