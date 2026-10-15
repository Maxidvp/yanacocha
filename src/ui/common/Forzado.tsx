// Forzado de un punto de I/O (editor en línea) y nombre lógico con marca "propuesto".
import { useState } from 'react';
import { useSim } from '../../store/sim';
import { esAnalogica, type PuntoIO } from '../../sim/io/iotable';
import { rangoAI } from '../../sim/params';
import type { Engine } from '../../sim/engine';
import { t } from '../../i18n';

/** Nombre lógico (identificador principal en la UI); los de señales de motor son propuestos. */
export function NombreLogico({ nombre, propuesto }: { nombre: string; propuesto?: boolean }) {
  return (
    <>
      <span>{nombre}</span>
      {propuesto && <span className="badge A_CONFIRMAR" style={{ marginLeft: 4 }} title={t('Nombre propuesto: confirmar con el programador del PCS')}>{t('propuesto')}</span>}
    </>
  );
}

export function EditorForzado({ e, p, onClose }: { e: Engine; p: PuntoIO; onClose: () => void }) {
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
