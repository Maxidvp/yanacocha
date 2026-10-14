import { Component, useEffect, type ReactNode } from 'react';
import { useEngine, useSim, type Pantalla } from './store/sim';
import { fmt, tiempoSim } from './ui/common/util';
import { Faceplate } from './ui/Faceplate';
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
  const pl = e.planta;
  return (
    <header className="topbar">
      <div className="brand">
        <b>AWTP EAST · Yanacocha</b>
        <span>Filtros por gravedad y post-tratamiento · 16045-PK-30006</span>
      </div>
      <div className="clock">
        <button className="btn" onClick={() => setCorriendo(!corriendo)} aria-label={corriendo ? 'Pausar simulación' : 'Reanudar simulación'}>
          {corriendo ? '❚❚ Pausa' : '▶ Correr'}
        </button>
        <span className="t" title="Tiempo simulado">{tiempoSim(e.t)}</span>
        <div className="seg" role="group" aria-label="Velocidad de simulación">
          {VELOCIDADES.map((v) => (
            <button key={v} aria-pressed={velocidad === v} onClick={() => setVelocidad(v)}>×{v}</button>
          ))}
        </div>
        <button className="btn" onClick={() => saltar(3600)} title="Avanzar 1 h de simulación de golpe">+1 h</button>
      </div>
      <div className="kpis">
        <div className="kpi"><b>{fmt(pl.qEntrada, 0)}</b><span>Entrada m³/h</span></div>
        <div className="kpi"><b>{fmt(pl.qFiltrada, 0)}</b><span>Filtrada m³/h</span></div>
        <div className="kpi"><b>{fmt(pl.qBypass, 0)}</b><span>Bypass m³/h</span></div>
        <div className="kpi"><b style={{ color: e.pctFiltrado < 87 ? 'var(--crit)' : undefined }}>{fmt(e.pctFiltrado, 1)} %</b><span>Filtrado (≥ 87 %)</span></div>
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
        Alarmas: {activas.length} activas{alta ? ` · ${alta} altas` : ''}
      </button>
      {ultima ? (
        <>
          <span className={`prio ${ultima.def.prioridad}`}>{ultima.def.prioridad}</span>
          <span className="txt">
            <span className="mono">{ultima.def.id}</span> · {ultima.def.texto}
            {ultima.activa ? '' : ' (normalizada)'}
          </span>
          <button className="btn small" onClick={() => cmd({ tipo: 'ack', id: ultima.def.id })}>Reconocer</button>
          {sinRec.length > 1 && <button className="btn small" onClick={() => cmd({ tipo: 'ack_todas' })}>Reconocer {sinRec.length}</button>}
        </>
      ) : (
        <span className="txt dim">Sin alarmas pendientes de reconocer</span>
      )}
    </div>
  );
}

function Nav() {
  const pantalla = useSim((s) => s.pantalla);
  const setPantalla = useSim((s) => s.setPantalla);
  const e = useEngine();
  const activas = e.plc.alarmas.resumen.filter((a) => a.activa).length;
  return (
    <nav className="nav" aria-label="Pantallas">
      {PANTALLAS.map((p, i) => (
        <span key={p.id} style={{ display: 'contents' }}>
          {(i === 6 || i === 9) && <span className="sep" />}
          <button aria-current={pantalla === p.id ? 'page' : undefined} onClick={() => setPantalla(p.id)}>
            <span>{p.label}{p.id === 'alarmas' && activas ? ` (${activas})` : ''}</span>
            <span className="key">{p.key}</span>
          </button>
        </span>
      ))}
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
          <h3>Esta pantalla falló al dibujarse</h3>
          <p className="mono" style={{ fontSize: '0.85rem' }}>{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>Reintentar</button>
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
    <div className="app">
      <TopBar />
      <Banner />
      <Nav />
      <main className="main">
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
