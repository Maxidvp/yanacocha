// Mímico SVG escalado al contenedor (viewBox + width:100%) con zoom y desplazamiento.
// Zoom: botones, Ctrl/⌘ + rueda (sobre el cursor) o pellizco; desplazamiento: arrastrar con el mímico ampliado.
// Un arrastre no dispara el click del equipo que queda debajo.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { t } from '../../i18n';

interface Vista { x: number; y: number; w: number; h: number }

const ZOOM_MAX = 6;

export function MimicoZoom({ ancho, alto, label, children }: { ancho: number; alto: number; label: string; children: ReactNode }) {
  const [v, setV] = useState<Vista>({ x: 0, y: 0, w: ancho, h: alto });
  const ref = useRef<SVGSVGElement>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movido: boolean; dist?: number; vw?: number } | null>(null);
  const suprimirClick = useRef(false);

  const limitar = (n: Vista): Vista => {
    const w = Math.min(ancho, Math.max(ancho / ZOOM_MAX, n.w));
    const h = (w * alto) / ancho;
    return { w, h, x: Math.min(ancho - w, Math.max(0, n.x)), y: Math.min(alto - h, Math.max(0, n.y)) };
  };
  /** Zoom por factor f (<1 acerca) alrededor del punto (cx, cy) en coordenadas del mímico. */
  const zoom = (f: number, cx = v.x + v.w / 2, cy = v.y + v.h / 2, base = v) =>
    setV(limitar({ w: base.w * f, h: base.h * f, x: cx - (cx - base.x) * f, y: cy - (cy - base.y) * f }));
  /** Pasa coordenadas de pantalla a coordenadas del mímico. */
  const aMimico = (px: number, py: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: v.x + ((px - r.left) / r.width) * v.w, y: v.y + ((py - r.top) / r.height) * v.h };
  };

  // Ctrl/⌘ + rueda: listener nativo no pasivo para poder evitar el zoom de la página (la rueda sola desplaza la página)
  const wheelRef = useRef<(ev: globalThis.WheelEvent) => void>(() => {});
  wheelRef.current = (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const p = aMimico(ev.clientX, ev.clientY);
    zoom(ev.deltaY > 0 ? 1.2 : 1 / 1.2, p.x, p.y);
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (ev: globalThis.WheelEvent) => wheelRef.current(ev);
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, []);
  const onPointerDown = (ev: PointerEvent<SVGSVGElement>) => {
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const ps = [...punteros.current.values()];
    if (ps.length === 2) {
      arrastre.current = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2, vx: v.x, vy: v.y, movido: true, dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), vw: v.w };
    } else arrastre.current = { x: ev.clientX, y: ev.clientY, vx: v.x, vy: v.y, movido: false };
  };
  const onPointerMove = (ev: PointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    if (!a || !punteros.current.has(ev.pointerId)) return;
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const r = ref.current!.getBoundingClientRect();
    const ps = [...punteros.current.values()];
    if (ps.length === 2 && a.dist && a.vw) {
      // pellizco
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const c = aMimico((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2);
      const w = a.vw * (a.dist / Math.max(d, 1));
      zoom(w / v.w, c.x, c.y);
      return;
    }
    const dx = ev.clientX - a.x;
    const dy = ev.clientY - a.y;
    if (!a.movido && Math.hypot(dx, dy) < 5) return;
    if (v.w >= ancho) return; // sin zoom no hay nada que desplazar
    a.movido = true;
    setV(limitar({ ...v, x: a.vx - (dx / r.width) * v.w, y: a.vy - (dy / r.height) * v.h }));
  };
  const terminar = (ev: PointerEvent<SVGSVGElement>) => {
    punteros.current.delete(ev.pointerId);
    if (arrastre.current?.movido) suprimirClick.current = true;
    if (punteros.current.size === 0) arrastre.current = null;
  };
  const ampliado = v.w < ancho - 1;

  return (
    <div className="mimic-wrap zoomable">
      <div className="zoom-ctl" role="group" aria-label={t('Zoom del mímico')}>
        <button className="btn small" onClick={() => zoom(1 / 1.4)} aria-label={t('Acercar')} title={t('Acercar (Ctrl + rueda)')}>+</button>
        <button className="btn small" onClick={() => zoom(1.4)} disabled={!ampliado} aria-label={t('Alejar')} title={t('Alejar')}>−</button>
        <button className="btn small" onClick={() => setV({ x: 0, y: 0, w: ancho, h: alto })} disabled={!ampliado} aria-label={t('Ver todo')} title={t('Ver todo')}>⤢</button>
      </div>
      <svg
        ref={ref}
        className={`mimic${ampliado ? ' ampliado' : ''}`}
        viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        onClickCapture={(ev) => {
          if (suprimirClick.current) {
            suprimirClick.current = false;
            ev.stopPropagation();
            ev.preventDefault();
          }
        }}
      >
        {children}
      </svg>
    </div>
  );
}
