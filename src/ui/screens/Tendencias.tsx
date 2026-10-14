import { useState } from 'react';
import { useEngine } from '../../store/sim';
import { TrendPane } from '../common/Trend';
import { copiar, grupoTxt, serieTxt, unidadTxt } from '../common/util';
import { t } from '../../i18n';

// Claves en español (también son la clave de t() al mostrarlas).
const PRESETS: Record<string, string[][]> = {
  'Filtros: niveles y pasos': [['LIT-160305604', 'LIT-160305615', 'LIT-160305623', 'LIT-160305631'], ['PASO-A', 'PASO-B', 'PASO-C', 'PASO-D'], ['Q-SEVO-A', 'Q-SEVO-B', 'Q-SEVO-C', 'Q-SEVO-D']],
  'Bypass FIC-603': [['FIT-160305603', 'FY-160305603'], ['FCV-160305603', 'FZI-160305603'], ['Q-ENTRADA', 'Q-FILTROS']],
  'TK-30015': [['LIT-160305601'], ['AIT-160305600'], ['AIT-160305442'], ['Q-ENTRADA', 'Q-FILTROS', 'Q-FILTRADA']],
  'Aire': [['FIT-160305602'], ['FIT-160305607'], ['P-SOPLADO'], ['P-AIRE-INST']],
  'Eléctrico': [['KW-TOTAL'], ['I-460']],
  'Calidad y medio filtrante': [['TURB-FILTRADA', 'TURB-TK16'], ['MN-FILTRADA'], ['SUC-A', 'SUC-B', 'SUC-C', 'SUC-D'], ['CAPOX-A', 'CAPOX-B', 'CAPOX-C', 'CAPOX-D'], ['CL-A', 'CL-B', 'CL-C', 'CL-D']],
  'TK-30016 y sumideros': [['LIT-160305276'], ['AIT-160305288'], ['LI-TK30038'], ['Q-RETROLAVADO']],
};

const VENTANAS: [string, number][] = [['10 min', 600], ['1 h', 3600], ['4 h', 14400], ['12 h', 43200], ['24 h', 86400]];

export function Tendencias() {
  const e = useEngine();
  const [preset, setPreset] = useState('Filtros: niveles y pasos');
  const [paneles, setPaneles] = useState<string[][]>(PRESETS['Filtros: niveles y pasos']);
  const [ventana, setVentana] = useState(14400);
  const [nueva, setNueva] = useState(e.hist.series[0].id);
  const [csv, setCsv] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ es: string; n?: number } | null>(null);
  const elegirPreset = (p: string) => {
    setPreset(p);
    setPaneles(PRESETS[p]);
  };
  const copiarCSV = async () => {
    const crudo = e.hist.csv(Math.max(0, e.t - ventana));
    const corte = crudo.indexOf('\n');
    const cab = corte < 0 ? crudo : crudo.slice(0, corte);
    const texto = cab.split('[paso]').join(`[${t('paso')}]`) + (corte < 0 ? '' : crudo.slice(corte));
    if (await copiar(texto)) {
      setAviso({ es: 'CSV copiado al portapapeles ({n} filas).', n: texto.split('\n').length - 1 });
      setCsv(null);
    } else {
      setAviso({ es: 'El portapapeles no está disponible: seleccioná y copiá el texto.' });
      setCsv(texto);
    }
  };
  const grupos = [...new Set(e.hist.series.map((s) => s.grupo))];
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Tendencias')}</h2>
        <p>{t('Historiador cada 5 s de tiempo simulado, 24 h de buffer. Un panel por unidad (un solo eje); pasá el cursor para leer valores.')}</p>
      </div>
      <div className="row">
        <select id="tr-preset" value={preset} onChange={(ev) => elegirPreset(ev.target.value)} aria-label={t('Conjunto de tendencias')}>
          {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{t(p)}</option>)}
          <option value="Personalizado">{t('Personalizado')}</option>
        </select>
        <div className="seg" role="group" aria-label={t('Ventana de tiempo')}>
          {VENTANAS.map(([t, v]) => <button key={v} aria-pressed={ventana === v} onClick={() => setVentana(v)}>{t}</button>)}
        </div>
        <select id="tr-serie" value={nueva} onChange={(ev) => setNueva(ev.target.value)} aria-label={t('Serie para agregar')}>
          {grupos.map((g) => (
            <optgroup key={g} label={grupoTxt(g)}>
              {e.hist.series.filter((s) => s.grupo === g).map((s) => <option key={s.id} value={s.id}>{serieTxt(s.label)} [{unidadTxt(s.unidad)}]</option>)}
            </optgroup>
          ))}
        </select>
        <button className="btn" onClick={() => { setPreset('Personalizado'); setPaneles([...paneles, [nueva]]); }}>{t('Agregar panel')}</button>
        <button className="btn" onClick={copiarCSV}>{t('Copiar CSV')}</button>
        {aviso && <span className="muted" role="status">{t(aviso.es, aviso.n !== undefined ? { n: aviso.n } : undefined)}</span>}
      </div>
      {csv && <textarea readOnly value={csv} style={{ width: '100%', height: 140, fontFamily: 'var(--font-data)', fontSize: 11 }} aria-label={t('CSV de tendencias')} />}
      <div className="grid g2">
        {paneles.map((ids, k) => (
          <div key={`${ids.join(',')}-${k}`} className="card">
            <TrendPane series={ids} ventana={ventana} alto={170} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn small" onClick={() => { setPreset('Personalizado'); setPaneles(paneles.filter((_, j) => j !== k)); }}>{t('Quitar')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
