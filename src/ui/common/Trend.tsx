// Panel de tendencia en canvas: una unidad por panel (un solo eje), cuadrícula tenue, cursor con tooltip.
import { useEffect, useRef, useState } from 'react';
import { useEngine } from '../../store/sim';
import { tiempoSim } from './util';

export const COLORES_SERIE = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];

function css(v: string, el: Element) {
  return getComputedStyle(el).getPropertyValue(v).trim() || '#888';
}

export interface TrendProps {
  series: string[];
  ventana: number;
  alto?: number;
  titulo?: string;
  /** líneas de referencia horizontales (p. ej., setpoints de alarma) */
  refs?: { v: number; label: string }[];
  escalon?: boolean;
}

export function TrendPane({ series, ventana, alto = 150, titulo, refs = [], escalon }: TrendProps) {
  const e = useEngine();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; t: number; vals: { id: string; v: number; color: string }[] } | null>(null);
  const defs = series.map((id) => e.hist.series.find((s) => s.id === id)).filter(Boolean) as typeof e.hist.series;
  const unidad = defs[0]?.unidad ?? '';
  const tFin = e.t;
  const tIni = Math.max(0, tFin - ventana);
  const datos = defs.map((d) => e.hist.ventana(d.id, tIni));

  // escala Y común (un solo eje)
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const d of datos) for (const v of d.v) if (Number.isFinite(v)) { ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); }
  for (const r of refs) { ymin = Math.min(ymin, r.v); ymax = Math.max(ymax, r.v); }
  const dmin = defs.map((d) => d.min).filter((x): x is number => x !== undefined);
  if (dmin.length && Number.isFinite(ymin)) ymin = Math.min(ymin, Math.min(...dmin));
  if (!Number.isFinite(ymin)) { ymin = 0; ymax = 1; }
  if (unidad === 'paso') { ymin = 0; ymax = 16; }
  if (ymax - ymin < 1e-6) { ymax += 1; ymin -= ymin > 0 ? Math.min(1, ymin) : 0; }
  const pad = unidad === 'paso' ? 0.5 : (ymax - ymin) * 0.08;
  ymax += pad;
  ymin = ymin >= 0 && ymin - pad < 0 ? 0 : ymin - pad;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = alto;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = 52;
    const R = 10;
    const T = 8;
    const B = 22;
    const pw = W - L - R;
    const ph = H - T - B;
    const X = (t: number) => L + ((t - tIni) / Math.max(1, tFin - tIni)) * pw;
    const Y = (v: number) => T + (1 - (v - ymin) / (ymax - ymin)) * ph;
    const ink2 = css('--ink-2', c);
    const grid = css('--grid', c);
    g.font = '11px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = ink2;
    g.strokeStyle = grid;
    g.lineWidth = 1;
    // cuadrícula Y: 4 divisiones
    for (let k = 0; k <= 4; k++) {
      const v = ymin + ((ymax - ymin) * k) / 4;
      const y = Y(v);
      g.beginPath();
      g.moveTo(L, y);
      g.lineTo(W - R, y);
      g.stroke();
      const txt = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
      g.textAlign = 'right';
      g.fillText(txt, L - 6, y + 4);
    }
    // eje X: 4 marcas de tiempo
    g.textAlign = 'center';
    for (let k = 0; k <= 4; k++) {
      const t = tIni + ((tFin - tIni) * k) / 4;
      const ts = tiempoSim(t);
      g.fillText(tFin - tIni > 7200 ? ts.slice(3, 8) : ts.slice(3), X(t), H - 6);
    }
    // referencias
    g.setLineDash([4, 4]);
    for (const r of refs) {
      g.strokeStyle = ink2;
      g.beginPath();
      g.moveTo(L, Y(r.v));
      g.lineTo(W - R, Y(r.v));
      g.stroke();
      g.textAlign = 'left';
      g.fillText(r.label, L + 4, Y(r.v) - 3);
    }
    g.setLineDash([]);
    // series
    datos.forEach((d, i) => {
      const color = css(COLORES_SERIE[i % COLORES_SERIE.length], c);
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.beginPath();
      let primero = true;
      let yPrev = 0;
      // decimación simple: como mucho ~2 puntos por píxel
      const paso = Math.max(1, Math.floor(d.t.length / (pw * 2)));
      for (let k = 0; k < d.t.length; k += paso) {
        const x = X(d.t[k]);
        const y = Y(d.v[k]);
        if (!Number.isFinite(y)) continue;
        if (primero) { g.moveTo(x, y); primero = false; }
        else if (escalon) { g.lineTo(x, yPrev); g.lineTo(x, y); }
        else g.lineTo(x, y);
        yPrev = y;
      }
      g.stroke();
      // punto final destacado
      if (d.t.length) {
        const x = X(d.t[d.t.length - 1]);
        const y = Y(d.v[d.v.length - 1]);
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    });
    if (hover) {
      g.strokeStyle = ink2;
      g.beginPath();
      g.moveTo(hover.x, T);
      g.lineTo(hover.x, T + ph);
      g.stroke();
    }
  });

  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const L = 52;
    const pw = rect.width - L - 10;
    const t = tIni + ((x - L) / pw) * (tFin - tIni);
    if (x < L || t > tFin) return setHover(null);
    const vals = datos.map((d, i) => {
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < d.t.length; k++) {
        const dd = Math.abs(d.t[k] - t);
        if (dd < bd) { bd = dd; best = k; }
      }
      return { id: defs[i].label, v: best >= 0 ? d.v[best] : NaN, color: `var(${COLORES_SERIE[i % COLORES_SERIE.length]})` };
    });
    setHover({ x, y: ev.clientY - rect.top, t, vals });
  };

  return (
    <div className="trend-pane">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="legend">
          {titulo && <strong style={{ fontFamily: 'var(--font-label)' }}>{titulo}</strong>}
          {defs.map((d, i) => (
            <span key={d.id}>
              <i style={{ background: `var(${COLORES_SERIE[i % COLORES_SERIE.length]})` }} />
              {d.label}
            </span>
          ))}
        </div>
        <span className="dim mono" style={{ fontSize: '0.8rem' }}>{unidad}</span>
      </div>
      <canvas ref={canvas} style={{ height: alto }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-label={`Tendencia ${defs.map((d) => d.label).join(', ')}`} />
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, (canvas.current?.clientWidth ?? 300) - 190), top: 24 }}>
          <div className="mono dim">{tiempoSim(hover.t)}</div>
          {hover.vals.map((v) => (
            <div key={v.id}>
              <i style={{ display: 'inline-block', width: 10, height: 3, background: v.color, marginRight: 6, verticalAlign: 'middle' }} />
              {v.id}: <b className="mono">{Number.isFinite(v.v) ? v.v.toFixed(2) : '—'}</b> {unidad}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
