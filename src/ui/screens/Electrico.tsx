import { electrico } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { Clic } from '../common/symbols';
import { TrendPane } from '../common/Trend';
import { fmt } from '../common/util';
import { t, td } from '../../i18n';

const ALIM_460 = ['16045-CM-30011', '16045-CM-30011-CC', '16045-CM-30012', '16045-CM-30012-CC', '16045-AG-30006', '16045-BL-30008', '16045-BL-30009', '16045-AG-30007'];

function Unifilar({ e }: { e: Engine }) {
  const pl = e.planta;
  const k = pl.kWcargas;
  const motorDe = (tag: string) => pl.motores.get(tag.replace(/-CC$/, ''));
  const pot = pl.alimPK30005;
  const salidas = electrico.tablero_instrumentos.salidas;
  return (
    <svg className="mimic" viewBox="0 0 1100 540" role="img" aria-label={t('Diagrama unifilar simplificado')}>
      <text className="t-tag" x={40} y={30}>{t('MCC 460 V 3F 60 Hz (por otros) · arranques DOL')}</text>
      <text className="t-val" x={1060} y={30} textAnchor="end">{fmt(pl.kWtotal - (k['BL-30008-ENC'] ?? 0) - (k['BL-30009-ENC'] ?? 0) - (k['16045-PK-30005JB'] ?? 0), 1)} kW · {fmt(pl.kVA460, 1)} kVA · {fmt(pl.I460, 0)} A</text>
      <line x1={40} x2={1060} y1={50} y2={50} stroke="var(--ink)" strokeWidth={5} />
      {ALIM_460.map((tag, n) => {
        const x = 90 + n * 125;
        const m = motorDe(tag);
        const esCC = tag.endsWith('-CC');
        const on = esCC ? (m?.contactor ?? false) : (m?.contactor ?? false);
        const falla = m && !esCC && (m.falla || m.sinTensionControl);
        const kw = k[tag] ?? 0;
        const amp = (kw * 1000) / (Math.sqrt(3) * e.params.v_bus_460 * 0.88);
        const c = electrico.cargas.find((x) => x.tag === tag);
        return (
          <Clic key={tag} s={{ tipo: 'motor', tag: tag.replace(/-CC$/, '') }} titulo={tag}>
            <g>
              <line x1={x} x2={x} y1={50} y2={250} stroke="var(--ink-2)" strokeWidth={2} />
              <rect x={x - 9} y={78} width={18} height={18} fill="var(--panel)" stroke="var(--ink-2)" strokeWidth={1.5} className="hl" />
              <text className="t-xs" x={x + 14} y={91}>CB</text>
              <g transform={`translate(${x},${135})`}>
                <rect x={-14} y={-12} width={28} height={24} fill="var(--panel)" />
                <line x1={-12} x2={12} y1={-5} y2={-5} className={on ? 'stroke-on' : 'stroke-off'} strokeWidth={3} />
                <line x1={-12} x2={12} y1={5} y2={5} className={on ? 'stroke-on' : 'stroke-off'} strokeWidth={3} />
                {!on && <line x1={-12} x2={12} y1={-12} y2={12} stroke="var(--off)" strokeWidth={1.5} />}
              </g>
              <text className="t-xs" x={x + 18} y={139}>{esCC ? t('alim.') : 'K'}</text>
              {!esCC && (
                <g>
                  <rect x={x - 16} y={168} width={32} height={18} fill="var(--panel-2)" stroke={falla ? 'var(--trip)' : 'var(--ink-2)'} strokeWidth={falla ? 2.5 : 1} />
                  <text className="t-xs" x={x} y={181} textAnchor="middle">MPR</text>
                </g>
              )}
              <circle cx={x} cy={250} r={22} className={falla ? 'st-trip' : kw > 0.1 ? 'st-on' : 'st-off'} stroke="var(--tank-wall)" strokeWidth={1.5} />
              <text x={x} y={255} textAnchor="middle" style={{ fill: '#fff', fontWeight: 700, fontSize: 13 }}>{esCC ? 'CC' : 'M'}</text>
              <text className="t-tag" x={x} y={292} textAnchor="middle">{tag.replace('16045-', '')}</text>
              <text className="t-val" x={x} y={308} textAnchor="middle">{fmt(kw, 1)} kW</text>
              <text className="t-val" x={x} y={322} textAnchor="middle">{fmt(amp, 0)} A</text>
              <text className="t-xs" x={x} y={336} textAnchor="middle">{t('{kw} kW nom · {serv}', { kw: c?.kW_nom ?? '—', serv: c?.servicio ?? '' })}</text>
            </g>
          </Clic>
        );
      })}

      {/* 220 V */}
      <text className="t-tag" x={40} y={385}>{t('Tablero 220 V – ventiladores cabina acústica')}</text>
      <line x1={40} x2={420} y1={400} y2={400} stroke="var(--ink)" strokeWidth={4} />
      {['BL-30008-ENC', 'BL-30009-ENC'].map((tag, n) => {
        const x = 120 + n * 190;
        const kw = k[tag] ?? 0;
        return (
          <g key={tag}>
            <line x1={x} x2={x} y1={400} y2={450} stroke="var(--ink-2)" strokeWidth={2} />
            <circle cx={x} cy={468} r={16} className={kw > 0 ? 'st-on' : 'st-off'} stroke="var(--tank-wall)" />
            <text x={x} y={472} textAnchor="middle" style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}>V</text>
            <text className="t-sm" x={x + 22} y={466}>{tag}</text>
            <text className="t-val" x={x + 22} y={480}>{fmt(kw * 1000, 0)} W (2 × 249 W)</text>
          </g>
        );
      })}

      {/* 120 VAC UPS → 24 VDC */}
      <text className="t-tag" x={500} y={385}>{t('120 VAC UPS (cliente) → 16045-PK-30005JB → 24 VDC')}</text>
      <g transform="translate(500, 400)">
        <rect x={0} y={10} width={70} height={40} rx={3} fill="var(--panel-2)" stroke={e.planta.fallas.ups120 ? 'var(--trip)' : 'var(--ink-2)'} strokeWidth={e.planta.fallas.ups120 ? 2.5 : 1} />
        <text className="t-sm" x={35} y={28} textAnchor="middle">UPS</text>
        <text className="t-val" x={35} y={43} textAnchor="middle">{e.planta.fallas.ups120 ? '0 V' : '120 VAC'}</text>
        <line x1={70} x2={110} y1={30} y2={30} stroke="var(--ink-2)" strokeWidth={2} />
        <rect x={110} y={20} width={30} height={20} fill="var(--panel)" stroke="var(--ink-2)" />
        <text className="t-xs" x={125} y={34} textAnchor="middle">3A</text>
        <line x1={140} x2={170} y1={30} y2={30} stroke="var(--ink-2)" strokeWidth={2} />
        <rect x={170} y={5} width={110} height={50} rx={3} fill="var(--panel-2)" stroke={pot ? 'var(--ink-2)' : 'var(--trip)'} strokeWidth={pot ? 1 : 2.5} />
        <text className="t-sm" x={225} y={24} textAnchor="middle">QUINT4-PS</text>
        <text className="t-val" x={225} y={40} textAnchor="middle">{pot ? '24.0 VDC' : '0 VDC'} · 1.3 A</text>
        <line x1={280} x2={330} y1={30} y2={30} stroke="var(--ink-2)" strokeWidth={2} />
        <rect x={330} y={20} width={30} height={20} fill="var(--panel)" stroke="var(--ink-2)" />
        <text className="t-xs" x={345} y={34} textAnchor="middle">1A×2</text>
        <line x1={360} x2={420} y1={30} y2={30} stroke="var(--ink-2)" strokeWidth={2} />
        {salidas.map((s, k) => (
          <text key={s.borne} className={k === 0 ? 't-val' : 't-sm'} x={425} y={26 + k * 16}>
            {s.borne.replace('TBP1/1A ', '')} → {td(s.carga)}{k === 0 ? ` · ${pot ? t('alimentado') : t('sin tensión')}` : ''}
          </text>
        ))}
        <text className="t-xs" x={0} y={78}>{t('Consumo del tablero: 0.37 A @ 120 VAC. Los LIT de filtros se alimentan desde la AI del PLC del cliente; FIT-602/607 en lazo desde el RIO; solenoides y finales de carrera con 24 VDC del panel de I/O del cliente vía VJB.')}</text>
      </g>
    </svg>
  );
}

export function Electrico() {
  const e = useEngine();
  const accion = useSim((s) => s.accion);
  const pl = e.planta;
  const k = pl.kWcargas;
  const tot = pl.tot;
  const kWhM3 = tot.entrada > 1 ? pl.kWh / tot.entrada : NaN;
  const maxKW = Math.max(150, ...Object.values(k));
  const cargas = electrico.cargas.filter((c) => c.tag in k || c.tag === '16045-PK-30005JB');
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Eléctrico')}</h2>
        <p>{t('Consumo en vivo según equipos en marcha, a partir de los kW absorbidos de la lista de cargas. Corriente de arranque DOL ≈ 6 × FLA durante la aceleración.')}</p>
      </div>
      <div className="grid g4">
        <div className="card"><div className="lbl">{t('Potencia total')}</div><div className="mono" style={{ fontSize: '1.6rem' }}>{fmt(pl.kWtotal, 1)} kW</div></div>
        <div className="card"><div className="lbl">{t('Barra 460 V')}</div><div className="mono" style={{ fontSize: '1.6rem' }}>{fmt(pl.I460, 0)} A</div><div className="dim">{t('{kva} kVA · fp 0.88', { kva: fmt(pl.kVA460, 1) })}</div></div>
        <div className="card"><div className="lbl">{t('Energía acumulada')}</div><div className="mono" style={{ fontSize: '1.6rem' }}>{fmt(pl.kWh, 1)} kWh</div><div className="dim">{t('USD {usd} a {c} USD/kWh', { usd: fmt(pl.kWh * e.params.costo_kWh, 2), c: e.params.costo_kWh })}</div></div>
        <div className="card"><div className="lbl">{t('Energía específica')}</div><div className="mono" style={{ fontSize: '1.6rem' }}>{fmt(kWhM3 * 1000, 1)} Wh/m³</div><div className="dim">{t('sobre {v} m³ tratados', { v: fmt(tot.entrada, 0) })}</div></div>
      </div>
      <div className="mimic-wrap"><Unifilar e={e} /></div>
      <div className="note">
        <span className="badge A_CONFIRMAR">{t('A confirmar')}</span> {t('Arranque de soplantes BL-30008/09: DOL según la lista de cargas (simulado: 6 × FLA = 1350 A en la barra durante la aceleración); la hoja del motor WEG dice VFD.')}
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>{t('Cargas')}</h3>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>Tag</th><th>{t('Descripción')}</th><th className="n">{t('kW nom')}</th><th className="n">{t('kW abs (lista)')}</th><th className="n">{t('kW ahora')}</th><th style={{ width: '28%' }}>{t('Carga')}</th></tr></thead>
              <tbody>
                {cargas.map((c) => {
                  const kw = k[c.tag] ?? 0;
                  return (
                    <tr key={c.tag}>
                      <td className="mono">{c.tag.replace('16045-', '')}</td>
                      <td>{td(c.desc)} <span className="dim">({c.V} V · {c.servicio ?? ''}{c.clase ? ` · ${c.clase}` : ''})</span></td>
                      <td className="n">{c.kW_nom ?? '—'}</td>
                      <td className="n">{c.kW_abs ?? c.consumo ?? '—'}</td>
                      <td className="n">{fmt(kw, 2)}</td>
                      <td><div className="bar"><i style={{ width: `${(100 * kw) / maxKW}%`, background: 'var(--s1)' }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 8 }}>{t('Servicio: C continuo · I intermitente · S standby. Clase: N normal · U UPS.')}</div>
        </div>
        <div className="card stack">
          <TrendPane series={['KW-TOTAL']} ventana={4 * 3600} titulo={t('Potencia total')} />
          <TrendPane series={['I-460']} ventana={4 * 3600} titulo={t('Corriente barra 460 V')} />
          <div className="row">
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={pl.fallas.ups120} onChange={(ev) => accion((en) => en.setFallaGlobal('ups120', ev.target.checked))} /> {t('Pérdida de 120 VAC UPS')}</label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={pl.fallas.dc24} onChange={(ev) => accion((en) => en.setFallaGlobal('dc24', ev.target.checked))} /> {t('Pérdida de 24 VDC (PK-30005JB)')}</label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={pl.fallas.dc24Cliente} onChange={(ev) => accion((en) => en.setFallaGlobal('dc24Cliente', ev.target.checked))} /> {t('Pérdida de 24 VDC del panel de I/O del cliente')}</label>
          </div>
        </div>
      </div>
    </div>
  );
}
