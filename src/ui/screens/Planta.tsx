import { layout, filtrosEquipo, type FuncionValvula, type LayoutItem } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import type { Engine } from '../../sim/engine';
import { CONST_PLANTA } from '../../sim/process/plant';
import { AgitadorPlantaSym, Clic } from '../common/symbols';
import { estadoMotor, estadoValvula, fmt, LETRAS } from '../common/util';
import { Inst } from './Resumen';

const S = 16; // px por metro

function estadoExterno(e: Engine, tag: string): 'on' | 'off' {
  const fr = e.planta.frontera;
  if (tag.includes('30407') || tag.includes('30408')) return fr.bombaBW ? 'on' : 'off';
  if (tag.includes('30169') || tag.includes('30170')) return fr.bombaRegen ? 'on' : 'off';
  if (tag.includes('30088') || tag.includes('30089')) return fr.qLiberacion > 1 ? 'on' : 'off';
  if (tag.includes('30161') || tag.includes('30162')) return fr.evacBW ? 'on' : 'off';
  return 'off';
}

function Item({ e, it }: { e: Engine; it: LayoutItem }) {
  const setPantalla = useSim((s) => s.setPantalla);
  const setFiltro = useSim((s) => s.setFiltro);
  const x = it.x * S;
  const y = it.y * S;
  const pl = e.planta;
  switch (it.kind) {
    case 'tanque': {
      const r = (it.r ?? 2) * S;
      const frac = it.tag.endsWith('30015') ? pl.L15 / 6500 : pl.L16 / CONST_PLANTA.H_TK16;
      return (
        <Clic s={{ tipo: 'tanque', tag: it.tag }} titulo={it.tag}>
          <circle cx={x} cy={y} r={r} fill="var(--panel)" stroke="var(--tank-wall)" strokeWidth={2} className="hl" />
          <circle cx={x} cy={y} r={r * Math.sqrt(Math.max(0.02, Math.min(1, frac)))} fill="var(--water-fill)" opacity={0.85} />
          <text className="t-tag" x={x} y={y + r + 15} textAnchor="middle">{it.label} · <tspan className="t-val">{fmt(frac * 100, 0)} %</tspan></text>
        </Clic>
      );
    }
    case 'agitador':
      return (
        <Clic s={{ tipo: 'motor', tag: it.tag }} titulo={it.tag}>
          <AgitadorPlantaSym x={x} y={y} r={it.tag.endsWith('30006') ? 15 : 22} velocidad={pl.motor(it.tag).velocidad} />
          <circle cx={x} cy={y} r={8} className={`st-${estadoMotor(e, it.tag)} hl`} stroke="var(--tank-wall)" />
          <text x={x} y={y + 3.5} textAnchor="middle" style={{ fill: '#fff', fontSize: 9, fontWeight: 700 }}>M</text>
        </Clic>
      );
    case 'soplante':
    case 'compresor': {
      const w = (it.w ?? 2) * S;
      const h = (it.h ?? 2) * S;
      return (
        <Clic s={{ tipo: 'motor', tag: it.tag }} titulo={it.tag}>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3} className={`st-${estadoMotor(e, it.tag)} hl`} stroke="var(--tank-wall)" opacity={0.9} />
          <text x={x} y={y + 4} textAnchor="middle" style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }}>{it.kind === 'soplante' ? 'BL' : 'CM'}</text>
          <text className="t-sm" x={x} y={y + h / 2 + 12} textAnchor="middle">{it.label}</text>
        </Clic>
      );
    }
    case 'filtro': {
      const i = filtrosEquipo.findIndex((f) => f.tag === it.tag);
      const f = pl.filtros[i];
      const s = e.plc.filtros[i];
      const w = (it.w ?? 3) * S;
      const h = (it.h ?? 12) * S;
      const frac = Math.min(1, f.h / CONST_PLANTA.ALTO_FILTRO_MM);
      const col = s.hold ? 'var(--trip)' : s.enLavado ? 'var(--accent)' : s.enServicio ? 'var(--on)' : 'var(--unk)';
      const fe = filtrosEquipo[i];
      const valv = (fn: FuncionValvula, vx: number, vy: number) => (
        <Clic key={fn} s={{ tipo: 'valvula', tag: fe.valvulas[fn] }} titulo={`${fe.valvulas[fn]} ${fn}`}>
          <rect x={vx - 5} y={vy - 5} width={10} height={10} className={`st-${estadoValvula(e, fe.valvulas[fn])} hl`} stroke="var(--tank-wall)" strokeWidth={0.8} />
        </Clic>
      );
      return (
        <g>
          <g className="clickable" role="button" tabIndex={0} aria-label={`Detalle filtro ${LETRAS[i]}`}
            onClick={() => { setFiltro(i); setPantalla('filtros'); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { setFiltro(i); setPantalla('filtros'); } }}>
            <title>{`${it.tag} – abrir detalle`}</title>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="var(--panel)" stroke={col} strokeWidth={3} />
            <rect x={x - w / 2 + 3} y={y - h / 2 + 3} width={w - 6} height={h - 6} fill="var(--water-fill)" opacity={0.25 + 0.7 * frac} />
            {f.qAire > 100 && <g className="bubbles">{Array.from({ length: 8 }, (_, k) => <circle key={k} cx={x - w / 2 + 8 + (k % 4) * 11} cy={y + 30 - Math.floor(k / 4) * 40} r={2.5} style={{ animationDelay: `${k * 0.2}s` }} />)}</g>}
            <text className="t-tag" x={x} y={y - h / 2 - 8} textAnchor="middle">{it.label}</text>
            <text x={x} y={y - 10} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: col }}>{s.hold ? 'H' : s.paso}</text>
            <text className="t-xs" x={x} y={y + 6} textAnchor="middle">{s.hold ? 'HOLD' : s.nombrePaso.split(' ')[0]}</text>
            <text className="t-val" x={x} y={y + 22} textAnchor="middle">{fmt(f.qSEVO, 0)}</text>
          </g>
          {valv('SEVI', x - 8, y - h / 2 - 22)}
          {valv('RI', x + 8, y - h / 2 - 22)}
          {(['AIRI', 'BWI', 'SEVO', 'FRO', 'BWO'] as FuncionValvula[]).map((fn, k) => valv(fn, x - 20 + k * 10, y + h / 2 + 12))}
        </g>
      );
    }
    case 'bomba': {
      const est = estadoExterno(e, it.tag);
      return (
        <Clic s={{ tipo: 'externo', tag: it.tag }} titulo={`${it.tag} (por otros)`}>
          <circle cx={x} cy={y} r={7} className={`st-${est} hl`} stroke="var(--tank-wall)" strokeDasharray="2 1.5" />
          <text className="t-xs" x={x} y={y + 19} textAnchor="middle">{it.label}</text>
        </Clic>
      );
    }
    case 'sumidero': {
      const w = (it.w ?? 4) * S;
      const h = (it.h ?? 4) * S;
      const regen = it.tag.endsWith('30038');
      const frac = regen ? pl.vRegen / e.params.sump_regen_m3 : pl.vTK39 / e.params.tk39_m3;
      return (
        <Clic s={{ tipo: 'tanque', tag: it.tag }} titulo={it.tag}>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="var(--panel)" stroke="var(--line-2)" strokeDasharray="6 3" className="hl" />
          <rect x={x - w / 2} y={y + h / 2 - h * frac} width={w} height={h * frac} fill={regen ? 'var(--regen)' : 'var(--water-dirty)'} opacity={0.22} />
          <text className="t-sm" x={x} y={y + h / 2 - 8} textAnchor="middle">{it.label} · {fmt(frac * 100, 0)} %</text>
        </Clic>
      );
    }
    case 'colector': {
      const w = (it.w ?? 4) * S;
      const h = (it.h ?? 4) * S;
      return (
        <g>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="url(#hatch)" stroke="var(--line-2)" />
          <text className="t-xs" x={x} y={y} textAnchor="middle" transform={`rotate(-90 ${x} ${y})`}>{it.label}</text>
        </g>
      );
    }
    default: {
      const w = (it.w ?? 1) * S;
      const h = (it.h ?? 1) * S;
      return (
        <g>
          <title>{it.nota ?? it.tag}</title>
          <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="var(--panel-2)" stroke="var(--ink-3)" />
          <text className="t-xs" x={x} y={it.tag.endsWith('30024') ? y + h / 2 + 11 : y - h / 2 - 3} textAnchor="middle">{it.label}</text>
        </g>
      );
    }
  }
}

export function Planta() {
  const e = useEngine();
  const W = layout.ancho_m * S;
  const H = layout.alto_m * S;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Vista de planta</h2>
        <p>Disposición física según el layout de instrumentos 26442-ST3-J2-16045-00001 (hojas 11 y 12, escala 1:100). Posiciones digitalizadas a ±1 m; cota de planta ≈ {layout.cota_planta_m} m s. n. m.</p>
      </div>
      <div className="mimic-wrap">
        <svg className="mimic" viewBox={`-10 -10 ${W + 20} ${H + 20}`} role="img" aria-label="Vista de planta del área">
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-2)" strokeWidth="1.5" />
            </pattern>
          </defs>
          {layout.areas.map((a) => (
            <g key={a.id}>
              {a.zonas.map(([x, y, w, h], k) => (
                <rect key={k} x={x * S} y={y * S} width={w * S} height={h * S} fill="var(--panel-2)" stroke="var(--line-2)" strokeDasharray="8 4" />
              ))}
              <text className="t-sm" x={a.zonas[0][0] * S + 6} y={a.zonas[0][1] * S + 14}>{a.titulo}</text>
            </g>
          ))}
          {layout.areas.flatMap((a) => a.items).map((it) => <Item key={it.tag} e={e} it={it} />)}
          {layout.areas.flatMap((a) => a.instrumentos).map((ins) =>
            ins.tag.startsWith('HV-') ? (
              <Clic key={ins.tag} s={{ tipo: 'valvula', tag: ins.tag }} titulo={ins.tag}>
                <rect x={ins.x * S - 6} y={ins.y * S - 6} width={12} height={12} className={`st-${estadoValvula(e, ins.tag)} hl`} stroke="var(--tank-wall)" />
                <text className="t-xs" x={ins.x * S + 9} y={ins.y * S + 4}>{ins.tag.replace('HV-160305', 'HV-')}</text>
              </Clic>
            ) : (
              <g key={ins.tag} transform={`translate(${ins.x * S}, ${ins.y * S}) scale(0.7)`}>
                <Inst e={e} tag={ins.tag} x={0} y={0} lado="b" unidad={ins.tag.startsWith('PI') ? 'kPag' : undefined} d={ins.tag.startsWith('AIT-160305600') ? 2 : 0} />
              </g>
            ),
          )}
          {/* norte y escala */}
          <g transform={`translate(20, ${H - 6})`}>
            <line x1={0} y1={0} x2={10 * S} y2={0} stroke="var(--ink)" strokeWidth={2} />
            <line x1={0} y1={-5} x2={0} y2={5} stroke="var(--ink)" strokeWidth={2} />
            <line x1={10 * S} y1={-5} x2={10 * S} y2={5} stroke="var(--ink)" strokeWidth={2} />
            <text className="t-xs" x={5 * S} y={-7} textAnchor="middle">10 m</text>
          </g>
          <g transform={`translate(${W - 30}, 30)`}>
            <path d="M 0 -16 L 7 8 L 0 3 L -7 8 Z" fill="var(--ink)" />
            <text className="t-sm" x={0} y={24} textAnchor="middle">N planta</text>
          </g>
        </svg>
      </div>
      <div className="note">{layout._nota}</div>
    </div>
  );
}
