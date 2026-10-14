// Estado de la UI. El motor de simulación vive fuera de React; la UI se suscribe a un contador de versión
// que se incrementa a ~5 Hz mientras corre la simulación.
import { create } from 'zustand';
import { Engine } from '../sim/engine';
import type { ComandoHMI } from '../sim/plc/plc';
import type { Params } from '../sim/params';

export type Pantalla =
  | 'resumen' | 'filtros' | 'rotativos' | 'electrico' | 'calidad' | 'planta' | 'io' | 'alarmas' | 'tendencias' | 'config' | 'datos';

export type Seleccion =
  | { tipo: 'motor'; tag: string }
  | { tipo: 'valvula'; tag: string }
  | { tipo: 'instrumento'; tag: string }
  | { tipo: 'fic' }
  | { tipo: 'tanque'; tag: string }
  | { tipo: 'externo'; tag: string };

interface SimState {
  engine: Engine;
  version: number;
  corriendo: boolean;
  velocidad: number;
  pantalla: Pantalla;
  filtroSel: number;
  seleccion: Seleccion | null;
  setPantalla: (p: Pantalla) => void;
  setFiltro: (i: number) => void;
  seleccionar: (s: Seleccion | null) => void;
  setCorriendo: (v: boolean) => void;
  setVelocidad: (v: number) => void;
  cmd: (c: ComandoHMI) => void;
  accion: (f: (e: Engine) => void) => void;
  saltar: (segundos: number) => void;
  cargarEscenario: (id: string, params?: Params) => void;
  refrescar: () => void;
}

const leer = <T,>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(`awtp.${k}`);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
};
const guardar = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`awtp.${k}`, JSON.stringify(v));
  } catch {
    /* almacenamiento no disponible */
  }
};

const PANTALLAS: Pantalla[] = ['resumen', 'filtros', 'rotativos', 'electrico', 'calidad', 'planta', 'io', 'alarmas', 'tendencias', 'config', 'datos'];
const hash = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
const pantallaInicial = (PANTALLAS.includes(hash as Pantalla) ? hash : leer<Pantalla>('pantalla', 'resumen')) as Pantalla;

export const useSim = create<SimState>((set, get) => ({
  engine: new Engine('normal'),
  version: 0,
  corriendo: true,
  velocidad: 10,
  pantalla: pantallaInicial,
  filtroSel: 0,
  seleccion: null,
  setPantalla: (pantalla) => {
    guardar('pantalla', pantalla);
    set({ pantalla });
  },
  setFiltro: (filtroSel) => set({ filtroSel }),
  seleccionar: (seleccion) => set({ seleccion }),
  setCorriendo: (corriendo) => set({ corriendo }),
  setVelocidad: (velocidad) => set({ velocidad }),
  cmd: (c) => {
    get().engine.cmd(c);
    // ejecuta un scan para que el operador vea la respuesta aun en pausa
    if (!get().corriendo) get().engine.avanzar(0.5);
    set((s) => ({ version: s.version + 1 }));
  },
  accion: (f) => {
    f(get().engine);
    set((s) => ({ version: s.version + 1 }));
  },
  saltar: (segundos) => {
    get().engine.avanzar(segundos);
    set((s) => ({ version: s.version + 1 }));
  },
  cargarEscenario: (id, params) => {
    set((s) => ({ engine: new Engine(id, params), version: s.version + 1, seleccion: null }));
  },
  refrescar: () => set((s) => ({ version: s.version + 1 })),
}));

/** Suscribe el componente al refresco de la simulación y devuelve el motor. */
export function useEngine(): Engine {
  useSim((s) => s.version);
  return useSim((s) => s.engine);
}

// ---- Lazo de tiempo real ----
let ultimo = typeof performance !== 'undefined' ? performance.now() : 0;
let acumUI = 0;
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    const ahora = performance.now();
    const realDt = Math.min(0.5, (ahora - ultimo) / 1000);
    ultimo = ahora;
    const s = useSim.getState();
    if (!s.corriendo) return;
    s.engine.avanzarAcumulado(realDt * s.velocidad);
    acumUI += realDt;
    if (acumUI >= 0.2) {
      acumUI = 0;
      s.refrescar();
    }
  }, 100);
}
