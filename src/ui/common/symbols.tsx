// Símbolos SVG del mímico (ISA 5.1 simplificado) con estado por color.
import type { ReactNode } from 'react';
import { useSim, type Seleccion } from '../../store/sim';
import type { EstadoVisual } from './util';
import { t } from '../../i18n';

function useSel(s: Seleccion | null) {
  const sel = useSim((st) => st.seleccion);
  const seleccionar = useSim((st) => st.seleccionar);
  const activo = !!s && !!sel && JSON.stringify(sel) === JSON.stringify(s);
  return { activo, onClick: () => s && seleccionar(s) };
}

/** Grupo clicable que abre el faceplate. */
export function Clic({ s, children, titulo }: { s: Seleccion; children: ReactNode; titulo?: string }) {
  const { onClick } = useSel(s);
  return (
    <g
      className="clickable"
      role="button"
      tabIndex={0}
      aria-label={titulo}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onClick();
        }
      }}
    >
      {titulo && <title>{titulo}</title>}
      {children}
    </g>
  );
}

/** Válvula on/off (corbatín). orient 'h' = cañería horizontal. */
export function ValvulaSym({ x, y, tag, estado, orient = 'h', etiqueta, size = 9, forzada }: { x: number; y: number; tag: string; estado: EstadoVisual; orient?: 'h' | 'v'; etiqueta?: string; size?: number; forzada?: boolean }) {
  const { activo } = useSel({ tipo: 'valvula', tag });
  const s = size;
  const pts = orient === 'h' ? `${-s},${-s * 0.7} ${s},${s * 0.7} ${s},${-s * 0.7} ${-s},${s * 0.7}` : `${-s * 0.7},${-s} ${s * 0.7},${s} ${-s * 0.7},${s} ${s * 0.7},${-s}`;
  return (
    <Clic s={{ tipo: 'valvula', tag }} titulo={`${tag}${etiqueta ? ' ' + etiqueta : ''}`}>
      <g transform={`translate(${x},${y})`}>
        <polygon points={pts} className={`st-${estado} hl`} stroke="var(--tank-wall)" strokeWidth={1} strokeLinejoin="round" />
        {forzada && <circle cx={s + 3} cy={-s} r={3.5} fill="var(--forced)" />}
        {activo && <circle r={s + 5} className="sel-ring" />}
        {etiqueta && (
          <text className="t-xs" x={orient === 'h' ? 0 : s + 4} y={orient === 'h' ? -s - 3 : 3} textAnchor={orient === 'h' ? 'middle' : 'start'}>
            {etiqueta}
          </text>
        )}
      </g>
    </Clic>
  );
}

/** Válvula de control con actuador de diafragma y posición. */
export function ValvulaControlSym({ x, y, pos, falla }: { x: number; y: number; pos: number; falla?: boolean }) {
  const { activo } = useSel({ tipo: 'fic' });
  const s = 11;
  const estado: EstadoVisual = falla ? 'trip' : pos > 1 ? 'on' : 'off';
  return (
    <Clic s={{ tipo: 'fic' }} titulo="FV-160305603 / FIC-160305603">
      <g transform={`translate(${x},${y})`}>
        <polygon points={`${-s},${-s * 0.7} ${s},${s * 0.7} ${s},${-s * 0.7} ${-s},${s * 0.7}`} className={`st-${estado} hl`} stroke="var(--tank-wall)" strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={-18} stroke="var(--tank-wall)" strokeWidth={1.5} />
        <path d="M -10 -18 A 10 8 0 0 1 10 -18 Z" fill="var(--panel-2)" stroke="var(--tank-wall)" strokeWidth={1.5} />
        <text className="t-val" x={14} y={-14}>{pos.toFixed(0)}%</text>
        {activo && <circle r={s + 7} className="sel-ring" />}
      </g>
    </Clic>
  );
}

export type TipoManual = 'mariposa' | 'bola' | 'retencion';

/** Tipo de válvula manual a partir del tag (VBF mariposa, VBA bola, VCH retención). */
export const tipoManual = (tag: string): TipoManual => (tag.includes('-VCH-') ? 'retencion' : tag.includes('-VBA-') ? 'bola' : 'mariposa');

/**
 * Válvula manual (ISA): corbatín con volante en T; mariposa con eje, bola con círculo, retención con flecha de sentido.
 * orient 'h' = cañería horizontal; sentido (+1/−1) = dirección del flujo para la retención.
 */
export function ValvulaManualSym({ x, y, tag, abierta, orient = 'h', size = 6, etiqueta, lado = 'arriba', sentido = 1 }: { x: number; y: number; tag: string; abierta: boolean; orient?: 'h' | 'v'; size?: number; etiqueta?: string; lado?: 'arriba' | 'abajo' | 'der' | 'izq'; sentido?: 1 | -1 }) {
  const { activo } = useSel({ tipo: 'manual', tag });
  const tipo = tipoManual(tag);
  const s = size;
  const estado: EstadoVisual = abierta ? 'on' : 'off';
  const pts = `${-s},${-s * 0.7} ${s},${s * 0.7} ${s},${-s * 0.7} ${-s},${s * 0.7}`;
  const tl = { arriba: [0, -s - 9, 'middle'], abajo: [0, s + 10, 'middle'], der: [s + 4, 3, 'start'], izq: [-s - 4, 3, 'end'] }[lado] as [number, number, 'middle' | 'start' | 'end'];
  const rot = orient === 'v' ? 90 : 0;
  return (
    <Clic s={{ tipo: 'manual', tag }} titulo={`${tag} · ${abierta ? t('abierta') : t('cerrada')}`}>
      <g transform={`translate(${x},${y})`}>
        <g transform={`rotate(${rot})`}>
          {tipo === 'retencion' ? (
            <>
              <polygon points={`${-s * sentido},${-s * 0.75} ${s * sentido},0 ${-s * sentido},${s * 0.75}`} className={`st-${estado} hl`} stroke="var(--tank-wall)" strokeWidth={1} strokeLinejoin="round" />
              <line x1={s * sentido} x2={s * sentido} y1={-s * 0.75} y2={s * 0.75} stroke="var(--tank-wall)" strokeWidth={1.4} />
            </>
          ) : (
            <>
              <polygon points={pts} className={`st-${estado} hl`} stroke="var(--tank-wall)" strokeWidth={1} strokeLinejoin="round" />
              {tipo === 'bola' && <circle r={s * 0.38} fill="var(--panel)" stroke="var(--tank-wall)" strokeWidth={0.9} />}
              {tipo === 'mariposa' && <line x1={0} x2={0} y1={-s * 0.75} y2={s * 0.75} stroke="var(--tank-wall)" strokeWidth={1.1} />}
              {/* volante en T (operador manual) */}
              <line x1={0} x2={0} y1={-s * 0.1} y2={-s - 3} stroke="var(--tank-wall)" strokeWidth={1} />
              <line x1={-s * 0.6} x2={s * 0.6} y1={-s - 3} y2={-s - 3} stroke="var(--tank-wall)" strokeWidth={1.3} />
            </>
          )}
        </g>
        {activo && <circle r={s + 5} className="sel-ring" />}
        {etiqueta && <text className="t-xs" x={tl[0]} y={tl[1]} textAnchor={tl[2]}>{etiqueta}</text>}
      </g>
    </Clic>
  );
}

/** Caudalímetro en línea (electromagnético "M"), clicable al instrumento. */
export function CaudalimetroSym({ x, y, tag }: { x: number; y: number; tag: string }) {
  const { activo } = useSel({ tipo: 'instrumento', tag });
  return (
    <Clic s={{ tipo: 'instrumento', tag }} titulo={tag}>
      <g transform={`translate(${x},${y})`}>
        <rect x={-11} y={-9} width={22} height={18} fill="var(--panel)" stroke="var(--tank-wall)" strokeWidth={1.3} className="hl" />
        <text textAnchor="middle" y={4} style={{ fontSize: 10, fontWeight: 700 }}>M</text>
        {activo && <circle r={17} className="sel-ring" />}
      </g>
    </Clic>
  );
}

/** Reducción concéntrica (trapecio) en cañería horizontal: ancho → angosto si dir = 1. */
export function ReduccionSym({ x, y, dir = 1, a = 6, b = 3.5 }: { x: number; y: number; dir?: 1 | -1; a?: number; b?: number }) {
  const [h1, h2] = dir === 1 ? [a, b] : [b, a];
  return <polygon points={`${x - 5},${y - h1} ${x + 5},${y - h2} ${x + 5},${y + h2} ${x - 5},${y + h1}`} fill="var(--panel)" stroke="var(--tank-wall)" strokeWidth={1} />;
}

/** Motor / bomba / soplante / compresor: círculo con letra. */
export function EquipoRotSym({ x, y, tag, estado, letra, r = 15, label, sub }: { x: number; y: number; tag: string; estado: EstadoVisual; letra: string; r?: number; label?: string; sub?: string }) {
  const { activo } = useSel({ tipo: 'motor', tag });
  return (
    <Clic s={{ tipo: 'motor', tag }} titulo={tag}>
      <g transform={`translate(${x},${y})`}>
        <circle r={r} className={`st-${estado} hl`} stroke="var(--tank-wall)" strokeWidth={1.5} />
        <text textAnchor="middle" y={4.5} style={{ fill: '#fff', fontSize: 13, fontWeight: 700 }}>{letra}</text>
        {activo && <circle r={r + 6} className="sel-ring" />}
        {label && <text className="t-tag" textAnchor="middle" y={r + 14}>{label}</text>}
        {sub && <text className="t-val" textAnchor="middle" y={r + 27}>{sub}</text>}
      </g>
    </Clic>
  );
}

/** Bomba por otros (frontera): contorno punteado. */
export function BombaExtSym({ x, y, tag, on, label, sub }: { x: number; y: number; tag: string; on: boolean; label: string; sub?: string }) {
  return (
    <Clic s={{ tipo: 'externo', tag }} titulo={t('{tag} (por otros)', { tag })}>
      <g transform={`translate(${x},${y})`}>
        <circle r={12} className={on ? 'st-on hl' : 'st-off hl'} stroke="var(--tank-wall)" strokeDasharray="3 2" strokeWidth={1.5} opacity={0.9} />
        <path d="M -4 -6 L 7 0 L -4 6 Z" fill="#fff" />
        <text className="t-sm" textAnchor="middle" y={25}>{label}</text>
        {sub && <text className="t-val" textAnchor="middle" y={37}>{sub}</text>}
      </g>
    </Clic>
  );
}

/** Burbuja de instrumento ISA con valor. */
export function InstrumentoSym({ x, y, tag, valor, unidad, alarma, mala, forzado, lado = 'r' }: { x: number; y: number; tag: string; valor: string; unidad?: string; alarma?: string | null; mala?: boolean; forzado?: boolean; lado?: 'r' | 'l' | 'b' }) {
  const { activo } = useSel({ tipo: 'instrumento', tag });
  const [func, num] = tag.split('-');
  const color = mala ? 'var(--trip)' : alarma ? 'var(--crit)' : 'var(--tank-wall)';
  const tx = lado === 'r' ? 21 : lado === 'l' ? -21 : 0;
  const ty = lado === 'b' ? 32 : 0;
  const anchor = lado === 'r' ? 'start' : lado === 'l' ? 'end' : 'middle';
  return (
    <Clic s={{ tipo: 'instrumento', tag }} titulo={tag}>
      <g transform={`translate(${x},${y})`}>
        <circle r={17} fill="var(--panel)" stroke={color} strokeWidth={alarma || mala ? 2.5 : 1.3} className="hl" />
        <line x1={-17} x2={17} y1={0} y2={0} stroke="var(--tank-wall)" strokeWidth={0.8} />
        <text textAnchor="middle" y={-4} style={{ fontSize: 9.5, fontWeight: 600 }}>{func}</text>
        <text textAnchor="middle" y={10} style={{ fontSize: 7.4 }}>{num?.slice(-6)}</text>
        {forzado && <circle cx={14} cy={-14} r={4} fill="var(--forced)" />}
        {activo && <circle r={23} className="sel-ring" />}
        <text className="t-val" x={tx} y={ty - 2} textAnchor={anchor} style={{ fontWeight: 600, fill: mala ? 'var(--trip)' : alarma ? 'var(--crit)' : undefined }}>
          {mala ? 'BAD' : valor}
          {unidad && !mala ? <tspan className="t-xs"> {unidad}</tspan> : null}
        </text>
        {alarma && !mala && (
          <text x={tx} y={ty + 10} textAnchor={anchor} style={{ fontSize: 9.5, fill: 'var(--crit)', fontWeight: 700 }}>
            {alarma}
          </text>
        )}
      </g>
    </Clic>
  );
}

/** Cañería con animación de flujo cuando circula. */
export function Pipe({ d, fluido, activa, ancho = 4 }: { d: string; fluido: 'water' | 'air' | 'chem' | 'regen' | 'waste'; activa: boolean; ancho?: number }) {
  return (
    <g>
      <path d={d} className={`pipe ${fluido}${activa ? '' : ' idle'}`} strokeWidth={ancho} />
      {activa && <path d={d} className={`flow ${fluido}`} />}
    </g>
  );
}

/** Tanque abierto con nivel. */
export function TanqueSym({ x, y, w, h, frac, tag, label, color = 'var(--water-fill)', children }: { x: number; y: number; w: number; h: number; frac: number; tag: string; label?: string; color?: string; children?: ReactNode }) {
  const { activo } = useSel({ tipo: 'tanque', tag });
  const f = Math.max(0, Math.min(1, frac));
  return (
    <Clic s={{ tipo: 'tanque', tag }} titulo={tag}>
      <g>
        <rect x={x} y={y + h * (1 - f)} width={w} height={h * f} fill={color} />
        <path d={`M ${x} ${y} L ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y}`} className="tank-wall hl" />
        {activo && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} className="sel-ring" />}
        {label && <text className="t-tag" x={x + w / 2} y={y + h + 15} textAnchor="middle">{label}</text>}
        {children}
      </g>
    </Clic>
  );
}

/** Indicador de flecha de entrada/salida (frontera). */
export function Frontera({ x, y, texto, sub, dir = 'r' }: { x: number; y: number; texto: string; sub?: string; dir?: 'r' | 'l' }) {
  const w = 132;
  const pts = dir === 'r' ? `0,0 ${w},0 ${w + 10},11 ${w},22 0,22` : `10,0 ${w + 10},0 ${w + 10},22 10,22 0,11`;
  return (
    <g transform={`translate(${x},${y - 11})`}>
      <polygon points={pts} fill="var(--panel-2)" stroke="var(--line-2)" strokeDasharray="4 2" />
      <text className="t-xs" x={dir === 'r' ? 6 : 16} y={10}>{texto}</text>
      {sub && <text className="t-val" x={dir === 'r' ? 6 : 16} y={20} style={{ fontSize: 10 }}>{sub}</text>}
    </g>
  );
}

/**
 * Agitador visto de costado: eje, impulsores de paletas inclinadas y remolino en el líquido.
 * Gira (animación) mientras el motor tiene velocidad; el período sigue a la velocidad del motor.
 */
export function AgitadorSym({ x, yTop, impulsores, velocidad, ancho = 36 }: { x: number; yTop: number; impulsores: number[]; velocidad: number; ancho?: number }) {
  const marcha = velocidad > 0.02;
  const periodo = 0.7 / Math.max(velocidad, 0.12);
  const w = ancho / 2;
  const yFondo = Math.max(...impulsores);
  return (
    <g>
      <line x1={x} x2={x} y1={yTop} y2={yFondo} stroke="var(--tank-wall)" strokeWidth={2} />
      {impulsores.map((y, k) => (
        <g key={k} transform={`translate(${x},${y})`}>
          {marcha && <ellipse className="agit-remolino" rx={w + 12} ry={11} style={{ animationDuration: `${periodo * 1.8}s` }} />}
          <g className={marcha ? 'agit-rotor' : undefined} style={marcha ? { animationDuration: `${periodo}s` } : undefined}>
            <polygon points={`${-w},-6 -3,-2 -3,3 ${-w},-1`} fill="var(--tank-wall)" />
            <polygon points={`${w},6 3,2 3,-3 ${w},1`} fill="var(--tank-wall)" />
          </g>
          <rect x={-3} y={-4} width={6} height={8} rx={1.5} fill="var(--tank-wall)" />
        </g>
      ))}
    </g>
  );
}

/** Agitador visto en planta: paletas que giran bajo el símbolo del motor. */
export function AgitadorPlantaSym({ x, y, r, velocidad }: { x: number; y: number; r: number; velocidad: number }) {
  const marcha = velocidad > 0.02;
  return (
    <g transform={`translate(${x},${y})`}>
      <g className={marcha ? 'agit-top' : undefined} style={marcha ? { animationDuration: `${1.4 / Math.max(velocidad, 0.12)}s` } : undefined}>
        <path d={`M ${-r} -2.5 L ${r} 2.5 L ${r} -2.5 L ${-r} 2.5 Z`} fill="var(--tank-wall)" opacity={0.75} />
        <path d={`M -2.5 ${-r} L 2.5 ${r} L -2.5 ${r} L 2.5 ${-r} Z`} fill="var(--tank-wall)" opacity={0.75} />
      </g>
    </g>
  );
}
