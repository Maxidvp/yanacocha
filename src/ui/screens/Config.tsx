import { useState } from 'react';
import { useEngine, useSim } from '../../store/sim';
import { ESCENARIOS, type Engine } from '../../sim/engine';
import { PARAM_DEFS, type ParamDef } from '../../sim/params';
import { fmt } from '../common/util';
import { getIdioma, t } from '../../i18n';
import { ESCENARIOS_EN, GRUPOS_PARAM_EN, PARAMS_EN } from '../../i18n/sim';

const en = () => getIdioma() === 'en';
const etiqueta = (d: ParamDef) => (en() ? PARAMS_EN[d.key]?.label ?? d.label : d.label);
const notaParam = (d: ParamDef) => (en() && d.nota ? PARAMS_EN[d.key]?.nota ?? d.nota : d.nota);
const grupo = (g: string) => (en() ? GRUPOS_PARAM_EN[g] ?? g : g);
const escNombre = (x: { id: string; nombre: string }) => (en() ? ESCENARIOS_EN[x.id]?.nombre ?? x.nombre : x.nombre);
const escDesc = (x: { id: string; descripcion: string }) => (en() ? ESCENARIOS_EN[x.id]?.descripcion ?? x.descripcion : x.descripcion);

interface Ejercicio {
  id: string;
  titulo: string;
  efecto: string;
  aplicar: (e: Engine) => void;
  limpiar: (e: Engine) => void;
  activo: (e: Engine) => boolean;
}

const EJERCICIOS: Ejercicio[] = [
  { id: 'aire', titulo: 'Pérdida de aire de instrumentos', efecto: 'FV-603 cierra por resorte; las on/off Tipo V5 quedan en su última posición; ZAO/ZAC en la próxima maniobra.', aplicar: (e) => e.setFallaGlobal('aireInstrumentos', true), limpiar: (e) => e.setFallaGlobal('aireInstrumentos', false), activo: (e) => e.planta.fallas.aireInstrumentos },
  { id: 'dc24', titulo: 'Pérdida de 24 VDC (PK-30005JB)', efecto: 'Solo FIT-160305603 queda sin alimentación: AI a 0 mA (falla de lazo NE43) y FIC-603 sin PV, que mantiene la salida. Nada más se afecta.', aplicar: (e) => e.setFallaGlobal('dc24', true), limpiar: (e) => e.setFallaGlobal('dc24', false), activo: (e) => e.planta.fallas.dc24 },
  { id: 'ups', titulo: 'Pérdida de 120 VAC UPS', efecto: 'Mismo efecto que la pérdida de 24 VDC de PK-30005JB: el UPS alimenta solo ese tablero (FIT-160305603).', aplicar: (e) => e.setFallaGlobal('ups120', true), limpiar: (e) => e.setFallaGlobal('ups120', false), activo: (e) => e.planta.fallas.ups120 },
  { id: 'dc24cli', titulo: 'Pérdida de 24 VDC del panel de I/O del cliente', efecto: 'Solenoides desenergizados: las on/off van a CERRADA (con aire); ZSO/ZSC sin tensión quedan en 0 → ZAO/ZAC; los lazos LIT de filtros caen a 0 mA.', aplicar: (e) => e.setFallaGlobal('dc24Cliente', true), limpiar: (e) => e.setFallaGlobal('dc24Cliente', false), activo: (e) => e.planta.fallas.dc24Cliente },
  { id: 'sevi', titulo: 'SEVI del filtro B trabada (HV-160305616)', efecto: 'No cierra en el próximo lavado de B → ZAC a los 15 s → HOLD por dispositivo.', aplicar: (e) => e.setFallaValvula('HV-160305616', true), limpiar: (e) => e.setFallaValvula('HV-160305616', false), activo: (e) => !!e.planta.valvulasOnOff.get('HV-160305616')?.trabada },
  { id: 'lit', titulo: 'Transmisor LIT-160305623 (filtro C) con lazo abierto', efecto: 'Falla de lazo NE43; sin LAHH posible y con T06/T09 que vencen → HOLD si lava.', aplicar: (e) => e.setFallaTransmisor('LIT-160305623', { modo: 'abierto' }), limpiar: (e) => e.setFallaTransmisor('LIT-160305623', { modo: 'ok' }), activo: (e) => !!e.planta.fallas.transmisor['LIT-160305623'] },
  { id: 'correa', titulo: 'Rotura de correa del soplante BL-30008', efecto: 'El motor gira sin aire: FALL-607 a los 30 s → disparo E10 de ambos soplantes → HOLD en paso 7.', aplicar: (e) => e.setFallaEquipo('correaRota', '16045-BL-30008', true), limpiar: (e) => e.setFallaEquipo('correaRota', '16045-BL-30008', false), activo: (e) => !!e.planta.fallas.correaRota['16045-BL-30008'] },
  { id: 'cm', titulo: 'Disparo MPR del compresor CM-30011', efecto: 'Sale el duty; arranca el standby CM-30012.', aplicar: (e) => e.setMotorFalla('16045-CM-30011', 'falla', true), limpiar: (e) => { e.setMotorFalla('16045-CM-30011', 'falla', false); e.resetMPR('16045-CM-30011'); }, activo: (e) => e.planta.motor('16045-CM-30011').falla },
  { id: 'bw', titulo: 'Bombas de retrolavado no disponibles', efecto: 'El próximo lavado entra en HOLD en el paso 10.', aplicar: (e) => e.setFallaGlobal('bombaRetrolavado', true), limpiar: (e) => e.setFallaGlobal('bombaRetrolavado', false), activo: (e) => e.planta.fallas.bombaRetrolavado },
  { id: 'turb', titulo: 'Pico de turbidez de entrada (10 NTU, Mn 0.09 mg/L)', efecto: 'Colmatación más rápida: LAHH antes que T03; más consumo de capacidad oxidativa.', aplicar: (e) => { e.setParam('turb_in', 10); e.setParam('mn_in', 0.09); }, limpiar: (e) => { e.setParam('turb_in', 5); e.setParam('mn_in', 0.05); }, activo: (e) => e.params.turb_in >= 10 },
  { id: 'corte', titulo: 'Corte de alimentación a TK-30015', efecto: 'El nivel cae bajo la caja de salida: los filtros cierran SEVO (condición anormal); con drenaje, LAL-601 dispara AG-30006.', aplicar: (e) => { e.setParam('q_RO_m3h', 0); e.setParam('q_HDS_m3h', 0); }, limpiar: (e) => { e.setParam('q_RO_m3h', 1030); e.setParam('q_HDS_m3h', 442); }, activo: (e) => e.params.q_RO_m3h + e.params.q_HDS_m3h === 0 },
];

function FilaParam({ e, d }: { e: Engine; d: ParamDef }) {
  const accion = useSim((s) => s.accion);
  const v = e.params[d.key];
  const [txt, setTxt] = useState<string | null>(null);
  const cambiado = Math.abs(v - d.nominal) > 1e-9;
  const aplicar = (n: number) => {
    if (!Number.isFinite(n)) return;
    const x = Math.min(d.max, Math.max(d.min, n));
    accion((en) => en.setParam(d.key, x));
    setTxt(null);
  };
  return (
    <tr>
      <td>
        {etiqueta(d)}
        {d.nota && <div className="dim" style={{ fontSize: '0.76rem' }}>{notaParam(d)}</div>}
      </td>
      <td><span className={`badge ${d.estado}`}>{d.estado === 'A_CONFIRMAR' ? t('A confirmar') : d.estado === 'SUPUESTO' ? t('Supuesto') : t('Documento')}</span></td>
      <td>
        {d.bool ? (
          <input type="checkbox" id={`p-${d.key}`} checked={!!v} onChange={(ev) => aplicar(ev.target.checked ? 1 : 0)} aria-label={etiqueta(d)} />
        ) : (
          <input
            type="number"
            id={`p-${d.key}`}
            aria-label={etiqueta(d)}
            value={txt ?? String(v)}
            min={d.min}
            max={d.max}
            step={d.step ?? 'any'}
            onChange={(ev) => setTxt(ev.target.value)}
            onBlur={() => txt !== null && aplicar(Number(txt))}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && txt !== null) aplicar(Number(txt)); }}
            style={{ borderColor: cambiado ? 'var(--accent)' : undefined }}
          />
        )}
      </td>
      <td className="dim" style={{ fontSize: '0.8rem' }}>{d.unit}</td>
      <td className="n dim" style={{ fontSize: '0.8rem' }}>{d.bool ? '' : `${fmt(d.min, d.min % 1 ? 3 : 0)}–${fmt(d.max, d.max % 1 ? 3 : 0)}`}</td>
      <td>{cambiado && <button className="btn small" onClick={() => aplicar(d.nominal)}>{t('Nominal')} {d.bool ? (d.nominal ? t('sí') : t('no')) : d.nominal}</button>}</td>
    </tr>
  );
}

export function Config() {
  const e = useEngine();
  const accion = useSim((s) => s.accion);
  const cargar = useSim((s) => s.cargarEscenario);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const grupos = [...new Set(PARAM_DEFS.map((d) => d.group))];
  const nAC = PARAM_DEFS.filter((d) => d.estado === 'A_CONFIRMAR').length;
  const nSup = PARAM_DEFS.filter((d) => d.estado === 'SUPUESTO').length;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Escenarios, fallas y parámetros')}</h2>
        <p>{t('Escenario actual:')} <b>{escNombre(ESCENARIOS.find((x) => x.id === e.escenario) ?? ESCENARIOS[0])}</b>. {t('Cargar un escenario reinicia la simulación.')}</p>
      </div>
      <div className="grid g3">
        {ESCENARIOS.map((x) => (
          <div key={x.id} className="card stack">
            <h3>{escNombre(x)}{x.id === e.escenario && <span className="pill on">{t('actual')}</span>}</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>{escDesc(x)}</p>
            {confirmar === x.id ? (
              <div className="confirm">
                <span>{t('Se pierde el estado actual.')}</span>
                <button className="btn primary small" onClick={() => { cargar(x.id); setConfirmar(null); }}>{t('Cargar')}</button>
                <button className="btn small" onClick={() => cargar(x.id, e.params)}>{t('Cargar con mis parámetros')}</button>
                <button className="btn small" onClick={() => setConfirmar(null)}>{t('Cancelar')}</button>
              </div>
            ) : (
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmar(x.id)}>{t('Cargar escenario')}</button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>{t('Inyección de fallas')}</h3>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>{t('Falla')}</th><th>{t('Qué debería pasar')}</th><th>{t('Estado')}</th></tr></thead>
            <tbody>
              {EJERCICIOS.map((x) => {
                const act = x.activo(e);
                return (
                  <tr key={x.id} className={act ? 'act' : ''}>
                    <td>{t(x.titulo)}</td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{t(x.efecto)}</td>
                    <td>
                      <button className={`btn small ${act ? 'danger' : ''}`} onClick={() => accion((en) => (act ? x.limpiar(en) : x.aplicar(en)))}>
                        {act ? t('Quitar falla') : t('Aplicar')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="note" style={{ marginTop: 6 }}>{t('Más fallas por equipo (fines de carrera, deriva de transmisores, no arranca, filtro de aire tapado) en cada faceplate.')}</div>
      </div>

      <div className="card">
        <h3>{t('Parámetros editables')} <span className="badge A_CONFIRMAR">{t('{n} a confirmar', { n: nAC })}</span> <span className="badge SUPUESTO">{t('{n} supuestos', { n: nSup })}</span></h3>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.88rem' }}>{t('Los cambios se aplican en vivo. Los valores marcados "A confirmar" tienen contradicciones entre documentos; los "Supuesto" no figuran en ellos y se eligieron para que el modelo sea coherente.')}</p>
        {grupos.map((g) => (
          <details key={g} open={g.startsWith('Filosofía')} style={{ marginBottom: 8 }}>
            <summary>{grupo(g)}</summary>
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>{t('Parámetro')}</th><th>{t('Estado')}</th><th>{t('Valor')}</th><th>{t('Unidad')}</th><th className="n">{t('Rango')}</th><th /></tr></thead>
                <tbody>{PARAM_DEFS.filter((d) => d.group === g).map((d) => <FilaParam key={d.key} e={e} d={d} />)}</tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
