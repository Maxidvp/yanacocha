import { Component, useEffect, type KeyboardEvent as TeclaReact, type ReactNode } from 'react';
import { useEngine, useSim, type Pantalla } from './store/sim';
import { fmt, tiempoSim } from './ui/common/util';
import { Faceplate } from './ui/Faceplate';
import { t, ts } from './i18n';
import { Resumen } from './ui/screens/Resumen';
import { Filtros } from './ui/screens/Filtros';
import { Rotativos } from './ui/screens/Rotativos';
import { Electrico } from './ui/screens/Electrico';
import { Calidad } from './ui/screens/Calidad';
import { Planta } from './ui/screens/Planta';
import { ListaIO } from './ui/screens/ListaIO';
import { Alarmas } from './ui/screens/Alarmas';
import { Tendencias } from './ui/screens/Tendencias';
import { Config } from './ui/screens/Config';
import { Datos } from './ui/screens/Datos';

const PANTALLAS: { id: Pantalla; label: string; key: string }[] = [
  { id: 'resumen', label: 'Resumen de planta', key: 'F1' },
  { id: 'filtros', label: 'Filtros A–D', key: 'F2' },
  { id: 'rotativos', label: 'Equipos rotativos', key: 'F3' },
  { id: 'electrico', label: 'Eléctrico', key: 'F4' },
  { id: 'calidad', label: 'Corrientes y calidad', key: 'F5' },
  { id: 'planta', label: 'Vista de planta', key: 'F6' },
  { id: 'io', label: 'Lista de I/O', key: 'F7' },
  { id: 'alarmas', label: 'Alarmas y C&E', key: 'F8' },
  { id: 'tendencias', label: 'Tendencias', key: 'F9' },
  { id: 'config', label: 'Escenarios y fallas', key: 'F10' },
  { id: 'datos', label: 'Fichas técnicas', key: 'F11' },
];

const VELOCIDADES = [1, 10, 60, 300];

function TopBar() {
  const e = useEngine();
  const corriendo = useSim((s) => s.corriendo);
  const velocidad = useSim((s) => s.velocidad);
  const setCorriendo = useSim((s) => s.setCorriendo);
  const setVelocidad = useSim((s) => s.setVelocidad);
  const saltar = useSim((s) => s.saltar);
  const idioma = useSim((s) => s.idioma);
  const setIdioma = useSim((s) => s.setIdioma);
  const pl = e.planta;
  return (
    <header className="topbar">
      <div className="brand">
        <b>AWTP EAST · Yanacocha</b>
        <span>{t('Filtros por gravedad y post-tratamiento · 16045-PK-30006')}</span>
      </div>
      <div className="clock">
        <button className="btn" onClick={() => setCorriendo(!corriendo)} aria-label={corriendo ? t('Pausar simulación') : t('Reanudar simulación')}>
          {corriendo ? t('❚❚ Pausa') : t('▶ Correr')}
        </button>
        <span className="t" title={t('Tiempo simulado')}>{tiempoSim(e.t)}</span>
        <div className="seg" role="group" aria-label={t('Velocidad de simulación')}>
          {VELOCIDADES.map((v) => (
            <button key={v} aria-pressed={velocidad === v} onClick={() => setVelocidad(v)}>×{v}</button>
          ))}
        </div>
        <button className="btn" onClick={() => saltar(3600)} title={t('Avanzar 1 h de simulación de golpe')}>+1 h</button>
        <div className="seg" role="group" aria-label={t('Idioma')}>
          {(['es', 'en'] as const).map((i) => (
            <button key={i} lang={i} aria-pressed={idioma === i} onClick={() => setIdioma(i)} title={i === 'en' ? 'English (/en)' : 'Español (/)'}>{i.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><b>{fmt(pl.qEntrada, 0)}</b><span>{t('Entrada m³/h')}</span></div>
        <div className="kpi"><b>{fmt(pl.qFiltrada, 0)}</b><span>{t('Filtrada m³/h')}</span></div>
        <div className="kpi"><b>{fmt(pl.qBypass, 0)}</b><span>Bypass m³/h</span></div>
        <div className="kpi"><b style={{ color: e.pctFiltrado < 87 ? 'var(--crit)' : undefined }}>{fmt(e.pctFiltrado, 1)} %</b><span>{t('Filtrado (≥ 87 %)')}</span></div>
        <div className="kpi"><b>{fmt(pl.kWtotal, 1)}</b><span>kW</span></div>
        <div className="kpi"><b>{fmt(e.planta.pH15, 2)}</b><span>pH TK-30015</span></div>
      </div>
    </header>
  );
}

function Banner() {
  const e = useEngine();
  const cmd = useSim((s) => s.cmd);
  const setPantalla = useSim((s) => s.setPantalla);
  const lista = e.plc.alarmas.resumen;
  const sinRec = lista.filter((a) => !a.reconocida).sort((a, b) => (b.tActivacion ?? 0) - (a.tActivacion ?? 0));
  const activas = lista.filter((a) => a.activa);
  const alta = activas.filter((a) => a.def.prioridad === 'ALTA').length;
  const ultima = sinRec[0];
  return (
    <div className="banner" role="status" aria-live="polite">
      <button className="btn small" onClick={() => setPantalla('alarmas')}>
        {t('Alarmas: {n} activas', { n: activas.length })}{alta ? ` · ${t('{n} altas', { n: alta })}` : ''}
      </button>
      {ultima ? (
        <>
          <span className={`prio ${ultima.def.prioridad}`}>{t(ultima.def.prioridad)}</span>
          <span className="txt">
            <span className="mono">{ultima.def.id}</span> · {ts(ultima.def.texto)}
            {ultima.activa ? '' : ` (${t('normalizada')})`}
          </span>
          <button className="btn small" onClick={() => cmd({ tipo: 'ack', id: ultima.def.id })}>{t('Reconocer')}</button>
          {sinRec.length > 1 && <button className="btn small" onClick={() => cmd({ tipo: 'ack_todas' })}>{t('Reconocer {n}', { n: sinRec.length })}</button>}
        </>
      ) : (
        <span className="txt dim">{t('Sin alarmas pendientes de reconocer')}</span>
      )}
    </div>
  );
}

function Nav() {
  const pantalla = useSim((s) => s.pantalla);
  const setPantalla = useSim((s) => s.setPantalla);
  const e = useEngine();
  const activas = e.plc.alarmas.resumen.filter((a) => a.activa).length;
  const onKey = (ev: TeclaReact) => {
    const k = PANTALLAS.findIndex((p) => p.id === pantalla);
    const n = PANTALLAS.length;
    const destino = { ArrowDown: k + 1, ArrowRight: k + 1, ArrowUp: k - 1, ArrowLeft: k - 1, Home: 0, End: n - 1 }[ev.key];
    if (destino === undefined) return;
    ev.preventDefault();
    const p = PANTALLAS[(destino + n) % n];
    setPantalla(p.id);
    document.getElementById(`tab-${p.id}`)?.focus();
  };
  return (
    <nav className="nav" aria-label={t('Pantallas')}>
      {/* pestañas principales: tablist con teclado (flechas, Inicio, Fin) */}
      <div role="tablist" aria-orientation="vertical" aria-label={t('Pantallas')} onKeyDown={onKey}>
        {PANTALLAS.map((p, i) => (
          <button
            key={p.id}
            id={`tab-${p.id}`}
            role="tab"
            aria-selected={pantalla === p.id}
            aria-controls="panel-pantalla"
            tabIndex={pantalla === p.id ? 0 : -1}
            className={i === 6 || i === 9 ? 'tras-sep' : undefined}
            onClick={() => setPantalla(p.id)}
          >
            <span>{t(p.label)}{p.id === 'alarmas' && activas ? ` (${activas})` : ''}</span>
            <span className="key">{p.key}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Evita que un error en una pantalla deje la consola en blanco. */
class Contencion extends Component<{ children: ReactNode; clave: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { clave: string }) {
    if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h3>{t('Esta pantalla falló al dibujarse')}</h3>
          <p className="mono" style={{ fontSize: '0.85rem' }}>{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>{t('Reintentar')}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const pantalla = useSim((s) => s.pantalla);
  const setPantalla = useSim((s) => s.setPantalla);
  const seleccionar = useSim((s) => s.seleccionar);
  const idioma = useSim((s) => s.idioma);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const m = /^F(\d{1,2})$/.exec(ev.key);
      if (m) {
        const p = PANTALLAS[Number(m[1]) - 1];
        if (p) {
          ev.preventDefault();
          setPantalla(p.id);
        }
      }
      if (ev.key === 'Escape') seleccionar(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPantalla, seleccionar]);
  return (
    <div className="app" key={idioma}>
      <TopBar />
      <Banner />
      <Nav />
      <main className="main" id="panel-pantalla" role="tabpanel" aria-labelledby={`tab-${pantalla}`}>
        <Contencion clave={pantalla}>
        {pantalla === 'resumen' && <Resumen />}
        {pantalla === 'filtros' && <Filtros />}
        {pantalla === 'rotativos' && <Rotativos />}
        {pantalla === 'electrico' && <Electrico />}
        {pantalla === 'calidad' && <Calidad />}
        {pantalla === 'planta' && <Planta />}
        {pantalla === 'io' && <ListaIO />}
        {pantalla === 'alarmas' && <Alarmas />}
        {pantalla === 'tendencias' && <Tendencias />}
        {pantalla === 'config' && <Config />}
        {pantalla === 'datos' && <Datos />}
        </Contencion>
      </main>
      <Faceplate />
    </div>
  );
}
