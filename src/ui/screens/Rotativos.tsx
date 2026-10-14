import { equipoPorTag } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { estadoMotor, fmt } from '../common/util';
import { TrendPane } from '../common/Trend';
import { t, td, ts } from '../../i18n';

function TarjetaMotor({ e, tag, extra }: { e: Engine; tag: string; extra?: React.ReactNode }) {
  const seleccionar = useSim((s) => s.seleccionar);
  const cmd = useSim((s) => s.cmd);
  const b = e.plc.motor(tag);
  const m = e.planta.motor(tag);
  const est = estadoMotor(e, tag);
  const eq = equipoPorTag(tag);
  return (
    <div className="card">
      <h3>
        <span className="mono">{tag.replace('16045-', '')}</span>
        <span className={`pill ${est}`}>{est === 'trip' ? t('Falla') : b.run ? t('Marcha') : t('Parado')}</span>
        {b.selector !== 'REMOTO' && <span className="pill info">{ts(b.selector)}</span>}
        {b.deSecuencia && <span className="pill unk">{ts(b.modoAM)}</span>}
        {m.estop && <span className="pill trip">E-Stop</span>}
      </h3>
      <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 6 }}>{td(eq?.nombre)}</div>
      {b.bloqueo && <div className="note warn" style={{ marginBottom: 6 }}>{ts(b.bloqueo)}</div>}
      <dl className="kv">
        <dt>{t('Corriente / potencia')}</dt><dd>{fmt(m.corriente, 0)} A · {fmt(m.kW, 1)} kW</dd>
        <dt>{t('Velocidad')}</dt><dd>{fmt(m.velocidad * 100, 0)} %</dd>
        <dt>{t('Disponible / FTS')}</dt><dd>{b.avl ? t('sí') : t('no')} / {b.fts ? t('SÍ') : t('no')}</dd>
        <dt>{t('Horas / arranques')}</dt><dd>{fmt(m.horas, 1)} h / {m.arranques}</dd>
        {extra}
      </dl>
      <div className="row" style={{ marginTop: 8 }}>
        {!b.deSecuencia && (
          <>
            <button className="btn on" aria-pressed={b.run} disabled={b.selector !== 'REMOTO'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'START' })}>START</button>
            <button className="btn off" aria-pressed={!b.run} disabled={b.selector !== 'REMOTO'} onClick={() => cmd({ tipo: 'motor', tag, accion: 'STOP' })}>STOP</button>
          </>
        )}
        <button className="btn" onClick={() => seleccionar({ tipo: 'motor', tag })}>Faceplate</button>
      </div>
    </div>
  );
}

export function Rotativos() {
  const e = useEngine();
  const cmd = useSim((s) => s.cmd);
  const plc = e.plc;
  const pl = e.planta;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Equipos rotativos')}</h2>
        <p>{t('Selector Local/Off/Remoto configurado en el PCS; JOG solo en Local desde la LCS; el E-Stop actúa siempre. Compresores y soplantes son duty/standby 2×100 %.')}</p>
      </div>

      <div className="card">
        <h3>{t('Compresores de aireación TK-30015 (Atlas Copco ZE, MK5)')}</h3>
        <div className="row">
          <span className="lbl">Duty</span>
          <div className="seg" role="group" aria-label={t('Compresor duty')}>
            {['16045-CM-30011', '16045-CM-30012'].map((t) => (
              <button key={t} aria-pressed={plc.dutyCompresor === t} onClick={() => cmd({ tipo: 'duty', grupo: 'compresores', tag: t })}>{t.slice(-8)}</button>
            ))}
          </div>
          <span className="lbl">{t('Aireación')}</span>
          <div className="seg" role="group" aria-label={t('Aireación habilitada')}>
            <button aria-pressed={plc.aireacionHabilitada} onClick={() => cmd({ tipo: 'aireacion', habilitada: true })}>{t('Habilitada')}</button>
            <button aria-pressed={!plc.aireacionHabilitada} onClick={() => cmd({ tipo: 'aireacion', habilitada: false })}>{t('Deshabilitada')}</button>
          </div>
          {plc.disparo('E13') && <span className="pill trip">{t('Disparo {e} – resetear en Alarmas', { e: 'E13' })}</span>}
        </div>
        <div className="grid g2" style={{ marginTop: 10 }}>
          {pl.compresores.map((c) => (
            <TarjetaMotor key={c.motor.tag} e={e} tag={c.motor.tag} extra={
              <>
                <dt>MK5</dt><dd>{ts(c.estado)}</dd>
                <dt>{t('Caudal / PT-711')}</dt><dd>{fmt(c.q, 0)} Nm³/h · {fmt(c.pDescarga, 0)} kPa</dd>
                <dt>{t('TT-703 descarga / TT-705 aceite')}</dt><dd>{fmt(c.tDescarga, 0)} / {fmt(c.tAceite, 0)} °C</dd>
              </>
            } />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>{t('Soplantes de air scour (Hibon SNH-870)')}</h3>
        <div className="row">
          <span className="lbl">Duty</span>
          <div className="seg" role="group" aria-label={t('Soplante duty')}>
            {['16045-BL-30008', '16045-BL-30009'].map((t) => (
              <button key={t} aria-pressed={plc.dutySoplante === t} onClick={() => cmd({ tipo: 'duty', grupo: 'soplantes', tag: t })}>{t.slice(-8)}</button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: '0.85rem' }}>{t('Arranca a pedido del paso 7; no arranca con HV-160305639 abierta (P&ID nota 9).')}</span>
          {plc.disparo('E10') && <span className="pill trip">{t('Disparo {e} – resetear en Alarmas', { e: 'E10' })}</span>}
        </div>
        <div className="grid g2" style={{ marginTop: 10 }}>
          {pl.soplantes.map((s) => (
            <TarjetaMotor key={s.motor.tag} e={e} tag={s.motor.tag} extra={
              <>
                <dt>{t('Caudal / presión')}</dt><dd>{fmt(s.q, 0)} Nm³/h · {fmt(s.pDescarga, 1)} kPag</dd>
                <dt>{t('Temp. descarga')}</dt><dd>{fmt(s.tDescarga, 0)} °C</dd>
              </>
            } />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>{t('Agitadores (Dynamix)')}</h3>
        <div className="grid g2">
          <TarjetaMotor e={e} tag="16045-AG-30006" extra={<><dt>{t('Nivel {tk} (mín. {min} mm)', { tk: 'TK-30015', min: 2794 })}</dt><dd>{fmt(pl.L15, 0)} mm</dd></>} />
          <TarjetaMotor e={e} tag="16045-AG-30007" extra={<><dt>{t('Nivel {tk} (mín. {min} mm)', { tk: 'TK-30016', min: 4064 })}</dt><dd>{fmt(pl.L16, 0)} mm</dd></>} />
        </div>
      </div>

      <div className="grid g2">
        <div className="card"><TrendPane series={['FIT-160305602']} ventana={3600} titulo={t('Aire compresores')} refs={[{ v: 385, label: 'HH 385' }, { v: 315, label: 'LL 315' }]} /></div>
        <div className="card"><TrendPane series={['FIT-160305607']} ventana={3600 * 4} titulo={t('Aire soplantes')} refs={[{ v: 3000, label: 'HH 3000' }, { v: 1500, label: 'LL 1500' }]} /></div>
      </div>
    </div>
  );
}
