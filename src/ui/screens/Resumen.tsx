import type { ComponentProps } from 'react';
import { filtrosEquipo, type FuncionValvula } from '../../data';
import { useEngine, useSim } from '../../store/sim';
import { CONST_PLANTA } from '../../sim/process/plant';
import { AgitadorSym, BombaExtSym, BurbujasAire, CaudalimetroSym, EquipoRotSym, Frontera, InstrumentoSym, Pipe, ReduccionSym, TanqueSym, ValvulaControlSym, ValvulaManualSym, ValvulaSym } from '../common/symbols';
import { MimicoZoom } from '../common/MimicoZoom';
import { estadoMotor, estadoValvula, fmt, LETRAS, lecturaLocal, manualAbierta } from '../common/util';
import type { Engine } from '../../sim/engine';
import { t, td, ts } from '../../i18n';

const CX = [480, 680, 880, 1080];
const FY = 200; // borde superior filtros
const FH = 220;
const FW = 130;
const H_AIRE = 465;
const H_BW = 500;
const H_FILT = 535;
const H_RW = 570;
const H_ENT = 100;
const H_RI = 130;
const H_BWO = 70;
// drenajes manuales de los filtros A–D (valvulas.json: "Drenaje filtro X → colector desecho")
const DRENAJES_FILTRO = ['16045-VBF-309718', '16045-VBF-309720', '16045-VBF-309722', '16045-VBF-309724'];

function alarmaDe(e: Engine, tag: string): string | null {
  const suf = tag.split('-')[1];
  const l = tag[0];
  for (const n of ['HH', 'LL', 'H', 'L']) if (e.plc.alarmas.activa(`${l}A${n}-${suf}`)) return n;
  return null;
}

/** Colector: la cañería completa en reposo y, encima, solo el tramo por donde circula, animado en el sentido del flujo. */
function Colector({ d, tramo, fluido, ancho }: { d: string; tramo: string | null; fluido: ComponentProps<typeof Pipe>['fluido']; ancho: number }) {
  return (
    <>
      <Pipe d={d} fluido={fluido} activa={false} ancho={ancho} />
      {tramo && <Pipe d={tramo} fluido={fluido} activa ancho={ancho} />}
    </>
  );
}

export function Inst({ e, tag, x, y, d = 0, unidad, lado = 'r' }: { e: Engine; tag: string; x: number; y: number; d?: number; unidad?: string; lado?: 'r' | 'l' | 'b' }) {
  const enIO = e.io.tiene(tag);
  const pv = e.plc.pv[tag] ?? (enIO ? e.io.ai(tag) : lecturaLocal(e, tag));
  const forz = enIO && e.io.punto(tag).forzado;
  return <InstrumentoSym x={x} y={y} tag={tag} valor={fmt(pv.eu, d)} unidad={unidad} alarma={alarmaDe(e, tag)} mala={pv.mala} forzado={forz} lado={lado} />;
}

function Filtro({ e, i }: { e: Engine; i: number }) {
  const setPantalla = useSim((s) => s.setPantalla);
  const setFiltro = useSim((s) => s.setFiltro);
  const cx = CX[i];
  const f = e.planta.filtros[i];
  const s = e.plc.filtros[i];
  const fe = filtrosEquipo[i];
  const x0 = cx - FW / 2;
  const frac = f.h / CONST_PLANTA.ALTO_FILTRO_MM;
  const hMedio = (CONST_PLANTA.ESPESOR_MEDIO_MM / CONST_PLANTA.ALTO_FILTRO_MM) * FH;
  const v = (fn: FuncionValvula) => fe.valvulas[fn];
  const est = (fn: FuncionValvula) => estadoValvula(e, v(fn));
  const fz = (fn: FuncionValvula) => e.io.punto(v(fn)).forzado;
  const sucio = Math.min(1, f.suciedad / 120);
  const colorPaso = s.hold ? 'var(--trip)' : s.enLavado ? 'var(--accent)' : s.enServicio ? 'var(--on)' : 'var(--ink-3)';
  return (
    <g>
      {/* cañerías de cada filtro */}
      <Pipe d={`M ${cx - 40} ${H_ENT} V ${FY}`} fluido="water" activa={f.qSEVI > 1} ancho={4} />
      <Pipe d={`M ${cx - 15} ${H_RI} V 185 H ${cx - 40}`} fluido="regen" activa={f.qRI > 1} ancho={2.5} />
      <Pipe d={`M ${cx + 50} ${FY + 6} V ${H_BWO}`} fluido="waste" activa={f.qBWO > 1} ancho={4} />
      <Pipe d={`M ${cx - 45} ${H_AIRE} V ${FY + FH}`} fluido="air" activa={f.qAire > 50} ancho={2.5} />
      <Pipe d={`M ${cx - 15} ${H_BW} V ${FY + FH}`} fluido="water" activa={f.qBWI > 1} ancho={3.5} />
      <Pipe d={`M ${cx + 15} ${FY + FH} V ${H_FILT}`} fluido="water" activa={f.qSEVO > 1} ancho={4} />
      <Pipe d={`M ${cx + 45} ${FY + FH} V ${H_RW}`} fluido="regen" activa={f.qRW > 1} ancho={3} />

      {/* cuerpo del filtro */}
      <g className="clickable" role="button" tabIndex={0} aria-label={t('Abrir detalle del filtro {f}', { f: LETRAS[i] })}
        onClick={() => { setFiltro(i); setPantalla('filtros'); }}
        onKeyDown={(ev) => { if (ev.key === 'Enter') { setFiltro(i); setPantalla('filtros'); } }}>
        <title>{t('{tag} – abrir detalle', { tag: fe.tag })}</title>
        <rect x={x0} y={FY} width={FW} height={FH} fill="var(--panel)" />
        <rect x={x0} y={FY + FH * (1 - Math.min(1, frac))} width={FW} height={FH * Math.min(1, frac)} fill={f.turbBWO > 20 ? 'var(--water-dirty)' : 'var(--water-fill)'} />
        <rect x={x0} y={FY + FH - hMedio} width={FW} height={hMedio * 0.17} fill="#3a3a3a" opacity={0.75} />
        <rect x={x0} y={FY + FH - hMedio * 0.83} width={FW} height={hMedio * 0.5} fill="#3f5a3c" opacity={0.75 + 0.25 * sucio} />
        <rect x={x0} y={FY + FH - hMedio * 0.33} width={FW} height={hMedio * 0.33} fill="#8b8579" opacity={0.75} />
        {f.qAire > 50 && <BurbujasAire x={x0} w={FW} yFondo={FY + FH - 6} ySup={FY + FH * (1 - Math.min(1, frac))} n={12} />}
        <path d={`M ${x0} ${FY} V ${FY + FH} H ${x0 + FW} V ${FY}`} className="tank-wall hl" />
        <text className="t-tag" x={x0 + 6} y={FY + 15}>{`${LETRAS[i]} · ${fe.tag.replace('16045-', '')}`}</text>
        <rect x={x0 + 5} y={FY + 21} width={FW - 10} height={17} rx={3} fill={colorPaso} opacity={0.95} />
        <text x={x0 + 10} y={FY + 33} style={{ fontSize: 10.5, fill: '#fff', fontWeight: 600 }}>
          {`${s.paso} ${s.hold ? 'HOLD' : td(s.nombrePaso)}`.slice(0, 24)}
        </text>
        <text className="t-sm" x={x0 + 6} y={FY + 52}>{s.modo === 'AUTO' ? t('Auto') : t('Semiauto')}{s.regenRequerida ? ` · ${t('regen.')}` : ''}</text>
        <text className="t-val" x={x0 + FW - 6} y={FY + 52} textAnchor="end">{fmt(f.qSEVO, 0)} m³/h</text>
      </g>
      <Inst e={e} tag={fe.transmisor_nivel} x={cx + 100} y={FY + 40} lado="b" />
      {/* drenaje manual del filtro → colector de desecho */}
      <Pipe d={`M ${x0} ${FY + FH - 8} H ${x0 - 18} V ${FY + FH + 6}`} fluido="waste" activa={f.qDrenaje > 0.5} ancho={2} />
      <ValvulaManualSym x={x0 - 10} y={FY + FH - 8} tag={DRENAJES_FILTRO[i]} abierta={manualAbierta(e, DRENAJES_FILTRO[i])} size={4.5} etiqueta={DRENAJES_FILTRO[i].slice(-6)} lado="arriba-izq" />

      {/* válvulas */}
      <ValvulaSym x={cx - 40} y={160} tag={v('SEVI')} estado={est('SEVI')} orient="v" forzada={fz('SEVI')} />
      <text className="t-xs" x={cx - 52} y={163} textAnchor="end">SEVI</text>
      <ValvulaSym x={cx - 15} y={160} tag={v('RI')} estado={est('RI')} orient="v" size={7} forzada={fz('RI')} />
      <text className="t-xs" x={cx - 6} y={150}>RI</text>
      <ValvulaSym x={cx + 50} y={160} tag={v('BWO')} estado={est('BWO')} orient="v" forzada={fz('BWO')} />
      <text className="t-xs" x={cx + 62} y={163}>BWO</text>
      {(['AIRI', 'BWI', 'SEVO', 'FRO'] as FuncionValvula[]).map((fn, k) => {
        const x = [cx - 45, cx - 15, cx + 15, cx + 45][k];
        return (
          <g key={fn}>
            <ValvulaSym x={x} y={448} tag={v(fn)} estado={est(fn)} orient="v" size={7} forzada={fz(fn)} />
            <text className="t-xs" x={x} y={433} textAnchor="middle" style={fn === 'FRO' ? { fontSize: 7.5 } : undefined}>{fn === 'FRO' ? 'RO/RW' : fn}</text>
          </g>
        );
      })}
    </g>
  );
}

export function Resumen() {
  const e = useEngine();
  const pl = e.planta;
  const p = e.params;
  const fr = pl.frontera;
  const L15frac = pl.L15 / 6500;
  const L16frac = pl.L16 / CONST_PLANTA.H_TK16;
  const yVert = 90 + 290 * (1 - p.tk15_vertedero_mm / 6500);
  // tramo de cada colector que realmente circula: desde el primer filtro que aporta, o hasta el último que recibe
  const fl = pl.filtros;
  const primero = (q: (f: (typeof fl)[number]) => number, min = 1) => fl.findIndex((f) => q(f) > min);
  const ultimo = (q: (f: (typeof fl)[number]) => number, min = 1) => fl.reduce((k, f, n) => (q(f) > min ? n : k), -1);
  const iSEVI = ultimo((f) => f.qSEVI);
  const iSEVO = primero((f) => f.qSEVO);
  const iRW = primero((f) => f.qRW);
  const iBWO = primero((f) => f.qBWO);
  const iBWI = primero((f) => f.qBWI);
  const iRI = primero((f) => f.qRI);
  const iAireDer = ultimo((f) => f.qAire, 50);
  const tramoAire = [
    pl.qAireSoplado > 50 ? `M 570 610 V ${H_AIRE}` : '',
    fl[0].qAire > 50 ? `M 570 ${H_AIRE} H ${CX[0] - 45}` : '',
    iAireDer >= 1 ? `M 570 ${H_AIRE} H ${CX[iAireDer] - 45}` : '',
  ].join(' ').trim() || null;
  const compQ = pl.compresores.map((c) => c.q);
  const hayAireTK = pl.qAireTK15 > 5;
  const regenPct = (100 * pl.vRegen) / p.sump_regen_m3;
  const tk39Pct = (100 * pl.vTK39) / p.tk39_m3;
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{t('Resumen de planta')}</h2>
        <p>{t('Paquete 16045-PK-30006 · tocá cualquier equipo, válvula o instrumento para abrir su faceplate; tocá un filtro para ver su detalle.')}</p>
      </div>
      <MimicoZoom ancho={1600} alto={900} label={t('Mímico de la planta AWTP EAST')}>
          {/* ---- entradas ---- */}
          <Frontera x={10} y={112} texto={t('Permeado RO (por otros)')} sub={`FIC-160305065 ${fmt(pl.qRO, 0)} m³/h`} />
          <Frontera x={10} y={150} texto={t('Agua tratada HDS')} sub={`FIC-160304333 ${fmt(pl.qHDS, 0)} m³/h`} />
          <Pipe d="M 152 112 H 180" fluido="water" activa={pl.qRO > 1} ancho={5} />
          <Pipe d="M 152 150 H 180" fluido="water" activa={pl.qHDS > 1} ancho={3.5} />
          <Frontera x={10} y={200} texto={t('H₂SO₄ (por otros)')} sub={`${fmt(fr.acidoLh, 1)} L/h`} />
          <Frontera x={10} y={236} texto={t('NaOH (por otros)')} sub={`${fmt(fr.sodaLh, 1)} L/h`} />
          <Frontera x={10} y={272} texto="NaPTC PK-30011" sub={`${fmt(pl.qEntrada > 0 ? p.naptc_Lh : 0, 1)} L/h`} />
          <Pipe d="M 152 200 H 180" fluido="chem" activa={fr.acidoLh > 0.1} ancho={2} />
          <Pipe d="M 152 236 H 180" fluido="chem" activa={fr.sodaLh > 0.1} ancho={2} />
          <Pipe d="M 152 272 H 180" fluido="chem" activa={pl.qEntrada > 0} ancho={2} />

          {/* ---- compresores y aireación ---- */}
          <Pipe d="M 76 470 H 120 V 505" fluido="air" activa={compQ[0] > 1} ancho={3} />
          <Pipe d="M 76 560 H 120 V 505" fluido="air" activa={compQ[1] > 1} ancho={3} />
          {pl.compresores.map((c, k) => (
            <ValvulaManualSym key={c.valvulaManual} x={99} y={[470, 560][k]} tag={c.valvulaManual} abierta={manualAbierta(e, c.valvulaManual)} size={5.5} etiqueta={c.valvulaManual.replace('16045-', '')} />
          ))}
          <Pipe d="M 120 505 H 150 V 372 H 182" fluido="air" activa={hayAireTK} ancho={3} />
          <Pipe d="M 120 505 V 610" fluido="air" activa={pl.qAire646 > 1} ancho={2} />
          <ValvulaSym x={120} y={585} tag="HV-160305646" estado={estadoValvula(e, 'HV-160305646')} orient="v" size={7} etiqueta="HV-646" />
          <EquipoRotSym x={60} y={470} tag="16045-CM-30011" estado={estadoMotor(e, '16045-CM-30011')} letra="C" label="CM-30011" sub={ts(pl.compresores[0].estado)} />
          <EquipoRotSym x={60} y={560} tag="16045-CM-30012" estado={estadoMotor(e, '16045-CM-30012')} letra="C" label="CM-30012" sub={ts(pl.compresores[1].estado)} />
          {/* FIT-160305602 (Prowirl 3″) en la descarga común de los compresores, con su línea de señal */}
          <CaudalimetroSym x={150} y={418} tag="FIT-160305602" letra="V" orient="v" />
          <line x1={141} x2={123} y1={418} y2={418} stroke="var(--tank-wall)" strokeWidth={0.9} strokeDasharray="3 2" />
          <Inst e={e} tag="FIT-160305602" x={106} y={418} unidad="Nm³/h" lado="l" />

          {/* ---- TK-30015 ---- */}
          <TanqueSym x={180} y={90} w={130} h={290} frac={L15frac} tag="16045-TK-30015" label="TK-30015 · 68 m³">
            <line x1={182} x2={308} y1={yVert} y2={yVert} stroke="var(--tank-wall)" strokeDasharray="4 3" strokeWidth={1} />
            <text className="t-xs" x={186} y={yVert - 4}>{t('caja de salida')}</text>
            {Array.from({ length: 9 }, (_, k) => <circle key={k} cx={196 + k * 12} cy={374} r={2} fill="var(--air)" />)}
            {hayAireTK && (
              <g className="bubbles">
                {Array.from({ length: 7 }, (_, k) => <circle key={k} cx={200 + k * 15} cy={360} r={2.2} style={{ animationDelay: `${k * 0.22}s` }} />)}
              </g>
            )}
            <text className="t-val" x={245} y={yVert + 26} textAnchor="middle">{fmt(pl.L15, 0)} mm</text>
          </TanqueSym>
          {/* AG-30006: 2 impulsores (1524 / 1778 mm según datasheet) */}
          <AgitadorSym x={245} yTop={70} impulsores={[262, 326]} velocidad={pl.motor('16045-AG-30006').velocidad} />
          <EquipoRotSym x={245} y={56} tag="16045-AG-30006" estado={estadoMotor(e, '16045-AG-30006')} letra="M" r={13} />
          <text className="t-tag" x={265} y={52}>AG-30006</text>
          {pl.qRebalse15 > 1 && <text x={186} y={84} style={{ fontSize: 11, fill: 'var(--crit)', fontWeight: 700 }}>{t('REBALSE {q} m³/h', { q: fmt(pl.qRebalse15, 0) })}</text>}
          {/* drenaje manual de TK-30015 → canaleta */}
          <Pipe d="M 303 380 V 424" fluido="water" activa={pl.qDrenaje15 > 1} ancho={3} />
          <ValvulaManualSym x={303} y={406} tag="16045-VBF-309703" abierta={manualAbierta(e, '16045-VBF-309703')} orient="v" size={5.5} etiqueta="VBF-309703" lado="der" />
          <text className="t-xs" x={303} y={434} textAnchor="middle">{t('a canaleta')}{pl.qDrenaje15 > 1 ? ` ${fmt(pl.qDrenaje15, 0)} m³/h` : ''}</text>
          <Inst e={e} tag="LIT-160305601" x={345} y={235} unidad="mm" />
          <Inst e={e} tag="AIT-160305600" x={345} y={285} d={2} unidad="pH" />
          <Inst e={e} tag="AIT-160305442" x={345} y={335} d={0} unidad="µS/cm" />

          {/* ---- colector de entrada a filtros ---- */}
          <Colector d={`M 310 ${yVert} H 360 V ${H_ENT} H ${CX[3] - 40}`} tramo={iSEVI >= 0 ? `M 310 ${yVert} H 360 V ${H_ENT} H ${CX[iSEVI] - 40}` : null} fluido="water" ancho={6} />
          <text className="t-sm" x={372} y={H_ENT - 8}>{t('Colector de entrada 40″ · {q} m³/h', { q: fmt(pl.qAFiltros, 0) })}</text>
          {/* regeneración (RI) y desecho BWO */}
          <Colector d={`M 1462 270 V ${H_RI} H ${CX[0] - 15}`} tramo={iRI >= 0 ? `M 1462 270 V ${H_RI} H ${CX[iRI] - 15}` : null} fluido="regen" ancho={3} />
          <Colector d={`M ${CX[0] + 50} ${H_BWO} H 1290`} tramo={iBWO >= 0 ? `M ${CX[iBWO] + 50} ${H_BWO} H 1290` : null} fluido="waste" ancho={5} />
          <text className="t-sm" x={CX[0] + 60} y={H_BWO - 8}>{t('Desecho de retrolavado (BWO) 24″')}</text>
          <text className="t-sm" x={1000} y={H_RI - 6}>{t('Regeneración (RI)')} {fr.qRegen > 1 ? `${fmt(fr.qRegen, 0)} m³/h` : ''}</text>

          {/* ---- colectores inferiores ---- */}
          <Colector d={`M 570 610 V ${H_AIRE} H ${CX[0] - 45} M 570 ${H_AIRE} H ${CX[3] - 45}`} tramo={tramoAire} fluido="air" ancho={3.5} />
          <Colector d={`M 1338 790 H 1180 V ${H_BW} H ${CX[0] - 15}`} tramo={iBWI >= 0 ? `M 1338 790 H 1180 V ${H_BW} H ${CX[iBWI] - 15}` : null} fluido="water" ancho={4.5} />
          <Colector d={`M ${CX[0] + 15} ${H_FILT} H 1290 V 560`} tramo={iSEVO >= 0 ? `M ${CX[iSEVO] + 15} ${H_FILT} H 1290 V 560` : null} fluido="water" ancho={6} />
          <Colector d={`M ${CX[0] + 45} ${H_RW} H 1220 V 300 H 1290`} tramo={iRW >= 0 ? `M ${CX[iRW] + 45} ${H_RW} H 1220 V 300 H 1290` : null} fluido="regen" ancho={3.5} />
          <text className="t-sm" x={CX[3] + 70} y={H_AIRE - 6}>{t('Aire de lavado')}</text>
          <text className="t-sm" x={CX[3] + 70} y={H_BW - 6}>{t('Retrolavado')} {fr.qBW > 1 ? `${fmt(fr.qBW, 0)} m³/h` : ''}</text>
          <text className="t-sm" x={CX[3] + 70} y={H_FILT - 6}>{t('Agua filtrada {q} m³/h', { q: fmt(pl.qFiltrada, 0) })}</text>
          <text className="t-sm" x={CX[3] + 70} y={H_RW - 6}>{t('Enjuague / desecho regen. (RO/RW)')}</text>

          {CX.map((_, i) => <Filtro key={i} e={e} i={i} />)}

          {/* ---- soplantes ---- */}
          <Pipe d="M 520 744 V 700 H 570" fluido="air" activa={pl.soplantes[0].q > 1 && pl.soplantes[0].qPSV < 1} ancho={3} />
          <Pipe d="M 620 744 V 700 H 570" fluido="air" activa={pl.soplantes[1].q > 1 && pl.soplantes[1].qPSV < 1} ancho={3} />
          {pl.soplantes.map((s, k) => <TrenSoplante key={s.motor.tag} e={e} k={k} />)}
          {/* montante de aire de las soplantes, a través de FIT-160305607 */}
          <Pipe d="M 570 700 V 610" fluido="air" activa={pl.qAireSoplado + pl.qAirePSVsoplantes > 50} ancho={3.5} />
          <Pipe d="M 570 668 H 660 V 690" fluido="air" activa={pl.qAire639 > 5} ancho={2} />
          <ValvulaSym x={640} y={668} tag="HV-160305639" estado={estadoValvula(e, 'HV-160305639')} size={7} etiqueta="HV-639" />
          <EquipoRotSym x={520} y={760} tag="16045-BL-30008" estado={estadoMotor(e, '16045-BL-30008')} letra="B" label="BL-30008" sub={`${fmt(pl.soplantes[0].pDescarga, 1)} kPag`} />
          <EquipoRotSym x={620} y={760} tag="16045-BL-30009" estado={estadoMotor(e, '16045-BL-30009')} letra="B" label="BL-30009" sub={`${fmt(pl.soplantes[1].pDescarga, 1)} kPag`} />
          {/* FIT-160305607 (Prowirl 6″) en la descarga común de las soplantes, con su línea de señal */}
          <CaudalimetroSym x={570} y={610} tag="FIT-160305607" letra="V" orient="v" />
          <line x1={561} x2={537} y1={610} y2={610} stroke="var(--tank-wall)" strokeWidth={0.9} strokeDasharray="3 2" />
          <Inst e={e} tag="FIT-160305607" x={520} y={610} unidad="Nm³/h" lado="l" />
          {pl.qAirePSVsoplantes > 10 && <text x={470} y={812} style={{ fontSize: 11, fill: 'var(--crit)', fontWeight: 700 }}>{t('PSV aliviando {q} Nm³/h', { q: fmt(pl.qAirePSVsoplantes, 0) })}</text>}

          {/* ---- bypass (estación según P&ID: VBF-309704 → VBA-309705 → FIT → FV → VBA-309707 → VBF-309708; VBF-309709 la rodea) ---- */}
          <EstacionBypass e={e} />
          <text className="t-sm" x={262} y={642}>{t('Bypass 24″ N12 → sumidero')}</text>

          {/* ---- sumidero agua filtrada y TK-30016 ---- */}
          <TanqueSym x={1250} y={560} w={80} h={120} frac={0.55} tag="FILTERED-WATER-SUMP" label={t('Sumidero agua filtrada')} color="var(--water-fill)" />
          <text className="t-xs" x={1290} y={708} textAnchor="middle">{t('(por otros)')}</text>
          <Pipe d="M 1330 600 H 1400" fluido="water" activa={pl.qSumidero > 1} ancho={5} />
          <TanqueSym x={1400} y={440} w={140} h={300} frac={L16frac} tag="16045-TK-30016" label={`TK-30016 · 216 m³ ${t('(por otros)')}`} />
          <AgitadorSym x={1470} yTop={420} impulsores={[694]} velocidad={pl.motor('16045-AG-30007').velocidad} ancho={42} />
          <EquipoRotSym x={1470} y={418} tag="16045-AG-30007" estado={estadoMotor(e, '16045-AG-30007')} letra="M" r={13} />
          <text className="t-tag" x={1490} y={414}>AG-30007</text>
          <text className="t-val" x={1470} y={520} textAnchor="middle">{fmt(pl.L16, 0)} mm</text>
          <Inst e={e} tag="LIT-160305276" x={1572} y={470} unidad="mm" lado="b" />
          <Inst e={e} tag="AIT-160305288" x={1572} y={560} d={2} unidad="pH" lado="b" />
          <Pipe d="M 1400 730 H 1380 V 790 H 1362" fluido="water" activa={fr.qBW > 1} ancho={4} />
          <BombaExtSym x={1350} y={790} tag="16045-PU-30407" on={fr.bombaBW} label="PU-30407/08" sub={fr.qBW > 1 ? `${fmt(fr.qBW, 0)} m³/h` : undefined} />
          <Pipe d="M 1540 730 H 1560 V 790" fluido="water" activa={fr.qLiberacion > 1} ancho={4} />
          <BombaExtSym x={1560} y={802} tag="16045-PU-30088" on={fr.qLiberacion > 1} label="PU-30088/89" sub={`${fmt(fr.qLiberacion, 0)} m³/h`} />
          <text className="t-xs" x={1560} y={855} textAnchor="middle">{t('a liberación')}</text>

          {/* ---- sumidero de regeneración TK-30038 y NaOCl ---- */}
          <TanqueSym x={1290} y={200} w={120} h={110} frac={regenPct / 100} tag="16045-TK-30038" label={`TK-30038 regen. ${fmt(regenPct, 0)} %`} color="color-mix(in srgb, var(--regen) 35%, transparent)" />
          <Pipe d="M 1410 290 H 1450" fluido="regen" activa={fr.qRegen > 1} ancho={3} />
          <BombaExtSym x={1462} y={290} tag="16045-PU-30169" on={fr.bombaRegen} label="PU-30169/70" />
          <Pipe d="M 1540 215 H 1490 V 175 H 1462" fluido="chem" activa={fr.naoclLh > 0} ancho={2} />
          <BombaExtSym x={1552} y={215} tag="16045-PU-30236" on={fr.bombaNaOCl} label="NaOCl" sub={fr.naoclLh > 0 ? `${fmt(fr.naoclLh, 0)} L/h` : undefined} />

          {/* ---- desecho de retrolavado TK-30039 ---- */}
          <TanqueSym x={1290} y={20} w={120} h={90} frac={tk39Pct / 100} tag="16045-TK-30039" label="" color="var(--water-dirty)" />
          <text className="t-tag" x={1418} y={45}>TK-30039</text>
          <text className="t-sm" x={1418} y={60}>{t('desecho retrolavado')}</text>
          <text className="t-val" x={1418} y={75}>{fmt(tk39Pct, 0)} % · {fmt(pl.turbTK39, 0)} NTU</text>

          {/* ---- leyenda ---- */}
          <g transform="translate(20, 830)">
            {([['on', 'Marcha / abierta'], ['off', 'Parada / cerrada'], ['trip', 'Falla / disparo'], ['moving', 'En recorrido']] as const).map(([k, lbl], n) => (
              <g key={k} transform={`translate(${n * 135}, 0)`}>
                <rect width={14} height={14} className={`st-${k}`} rx={2} />
                <text className="t-sm" x={20} y={11}>{t(lbl)}</text>
              </g>
            ))}
            {([['water', 'Agua'], ['air', 'Aire'], ['chem', 'Químicos'], ['regen', 'Regeneración'], ['waste', 'Desecho']] as const).map(([k, lbl], n) => (
              <g key={k} transform={`translate(${n * 105}, 26)`}>
                <line x1={0} x2={22} y1={7} y2={7} className={`pipe ${k}`} strokeWidth={4} />
                <text className="t-sm" x={28} y={11}>{t(lbl)}</text>
              </g>
            ))}
          </g>
      </MimicoZoom>
      <ResumenTablero e={e} />
      <BalanceAgua e={e} />
    </div>
  );
}

function ResumenTablero({ e }: { e: Engine }) {
  const pl = e.planta;
  const plc = e.plc;
  const setPantalla = useSim((s) => s.setPantalla);
  const setFiltro = useSim((s) => s.setFiltro);
  return (
    <div className="grid g4">
      {plc.filtros.map((s, i) => {
        const f = pl.filtros[i];
        const pre = s.preset(e.params);
        return (
          <button key={i} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => { setFiltro(i); setPantalla('filtros'); }}>
            <h3>
              {t('Filtro {l}', { l: LETRAS[i] })}
              <span className={`pill ${s.hold ? 'trip' : s.enServicio ? 'on' : s.enLavado ? 'info' : 'unk'}`}>{s.hold ? 'HOLD' : td(s.nombrePaso)}</span>
            </h3>
            <dl className="kv">
              <dt>{t('Paso / timer')}</dt><dd>{s.paso} · {fmt(s.timerPaso / 60, 1)}{pre ? ` / ${fmt(pre / 60, 1)}` : ''} min</dd>
              <dt>{t('Servicio desde lavado (T03)')}</dt><dd>{fmt(s.tServicioLavado / 3600, 1)} h</dd>
              <dt>{t('Caudal filtrado')}</dt><dd>{fmt(f.qSEVO, 0)} m³/h</dd>
              <dt>{t('Sólidos retenidos')}</dt><dd>{fmt(f.suciedad, 0)} kg</dd>
            </dl>
          </button>
        );
      })}
    </div>
  );
}

/** Estación de bypass FV-160305603 tal como en el P&ID. */
function EstacionBypass({ e }: { e: Engine }) {
  const pl = e.planta;
  const plc = e.plc;
  const Y = 650;
  const YL = 705; // línea paralela con VBF-309709
  const ab = (tag: string) => manualAbierta(e, tag);
  return (
    <g>
      <Pipe d={`M 700 ${Y} V ${YL} H 1030 V ${Y}`} fluido="water" activa={pl.qBypass709 > 1} ancho={5} />
      <Pipe d={`M 245 380 V ${Y} H 700`} fluido="water" activa={pl.qBypass + pl.qDrenajeBypass > 1} ancho={5} />
      <Pipe d={`M 700 ${Y} H 1030`} fluido="water" activa={pl.qFIT603 > 1} ancho={5} />
      <Pipe d={`M 1030 ${Y} H 1250`} fluido="water" activa={pl.qBypass > 1} ancho={5} />
      {/* drenajes de ½″ */}
      <Pipe d={`M 755 ${Y} V ${Y + 24}`} fluido="water" activa={ab('16045-VBA-309705') && pl.qDrenajeBypass > 0.5} ancho={1.5} />
      <Pipe d={`M 930 ${Y} V ${Y + 24}`} fluido="water" activa={ab('16045-VBA-309707') && pl.qDrenajeBypass > 0.5} ancho={1.5} />
      <ValvulaManualSym x={755} y={Y + 15} tag="16045-VBA-309705" abierta={ab('16045-VBA-309705')} orient="v" size={4.5} etiqueta="VBA-309705" lado="der" />
      <ValvulaManualSym x={930} y={Y + 15} tag="16045-VBA-309707" abierta={ab('16045-VBA-309707')} orient="v" size={4.5} etiqueta="VBA-309707" lado="der" />
      {/* aislamiento y reducciones 24″ × 16″ × 12″ */}
      <ValvulaManualSym x={725} y={Y} tag="16045-VBF-309704" abierta={ab('16045-VBF-309704')} size={7} etiqueta="VBF-309704" />
      <ReduccionSym x={785} y={Y} dir={1} />
      <CaudalimetroSym x={815} y={Y} tag="FIT-160305603" />
      <line x1={815} x2={815} y1={Y - 9} y2={622} stroke="var(--tank-wall)" strokeWidth={0.9} strokeDasharray="3 2" />
      <Inst e={e} tag="FIT-160305603" x={815} y={605} unidad="m³/h" lado="l" />
      <ValvulaControlSym x={880} y={Y} pos={plc.pv['FZI-160305603']?.eu ?? 0} falla={pl.fv603.trabada} />
      <ReduccionSym x={962} y={Y} dir={-1} />
      <ValvulaManualSym x={995} y={Y} tag="16045-VBF-309708" abierta={ab('16045-VBF-309708')} size={7} etiqueta="VBF-309708" />
      <ValvulaManualSym x={865} y={YL} tag="16045-VBF-309709" abierta={ab('16045-VBF-309709')} size={7} etiqueta="VBF-309709" lado="abajo" />
      {pl.qBypass709 > 1 && <text className="t-val" x={895} y={YL + 20}>{fmt(pl.qBypass709, 0)} m³/h {t('sin medir')}</text>}
      <text className="t-sm" x={872} y={600}>
        FIC-603 {plc.modoFIC === 'PROGRAMA' ? (plc.autoEfectivoFIC ? t('AUTO (prog.)') : t('MAN 0 % (prog.)')) : ts(plc.modoFIC)} · SP {fmt(plc.spFY, 0)} · OUT {fmt(plc.salidaFIC, 0)} %
      </text>
    </g>
  );
}

/** Tren de descarga de un soplante: PI con aislamiento y venteo, retención VCH y mariposa de descarga. */
function TrenSoplante({ e, k }: { e: Engine; k: number }) {
  const s = e.planta.soplantes[k];
  const x = [520, 620][k];
  const dir = k === 0 ? -1 : 1; // PI hacia afuera
  const xPI = x + dir * 52;
  const yPI = 740;
  const xAisl = x + dir * 17;
  const xDren = x + dir * 27;
  const lado = k === 0 ? 'izq' : 'der';
  return (
    <g>
      <line x1={x} x2={xPI - dir * 13} y1={yPI} y2={yPI} stroke="var(--tank-wall)" strokeWidth={1} />
      <line x1={xDren} x2={xDren} y1={yPI} y2={yPI + 13} stroke="var(--tank-wall)" strokeWidth={1} />
      {s.vAislPI && <ValvulaManualSym x={xAisl} y={yPI} tag={s.vAislPI} abierta={manualAbierta(e, s.vAislPI)} size={3.6} />}
      {s.vDrenPI && <ValvulaManualSym x={xDren} y={yPI + 8} tag={s.vDrenPI} abierta={manualAbierta(e, s.vDrenPI)} orient="v" size={3.2} />}
      <Inst e={e} tag={s.pi} x={xPI} y={yPI + 12} d={1} unidad="kPag" lado={k === 0 ? 'l' : 'r'} />
      {s.vRetencion && <ValvulaManualSym x={x} y={726} tag={s.vRetencion} abierta={manualAbierta(e, s.vRetencion)} orient="v" size={5} sentido={-1} etiqueta={s.vRetencion.slice(-6)} lado={lado} />}
      {s.vDescarga && <ValvulaManualSym x={x} y={711} tag={s.vDescarga} abierta={manualAbierta(e, s.vDescarga)} orient="v" size={5} etiqueta={s.vDescarga.slice(-6)} lado={lado} />}
    </g>
  );
}

/** Balance de agua de TK-30015 + filtros: entradas − salidas = acumulación (m³/h). */
function BalanceAgua({ e }: { e: Engine }) {
  const b = e.planta.balance;
  const fila = (k: string, v: number, fuerte = false) => (
    <>
      <dt>{k}</dt>
      <dd style={fuerte ? { fontWeight: 700 } : undefined}>{fmt(v, 0)} m³/h</dd>
    </>
  );
  return (
    <div className="card">
      <h3>{t('Balance de agua – TK-30015 + filtros')}</h3>
      <div className="grid g3">
        <dl className="kv">
          {fila(t('Entrada RO + HDS'), b.entrada)}
          {fila(t('Retrolavado (BWI)'), b.retrolavado)}
          {fila(t('Regeneración (RI)'), b.regeneracion)}
          {fila(t('Total entradas'), b.entradas, true)}
        </dl>
        <dl className="kv">
          {fila(t('Agua filtrada (SEVO)'), b.filtrada)}
          {fila(t('RO/RW'), b.rw)}
          {fila(t('Desecho de retrolavado (BWO)'), b.bwo)}
          {fila(t('Bypass'), b.bypass)}
          {fila(t('Rebalses y drenajes'), b.otras)}
          {fila(t('Total salidas'), b.salidas, true)}
        </dl>
        <dl className="kv">
          {fila(t('Acumulación (TK + filtros)'), b.acumulacion, true)}
          {fila(t('Cierre del balance'), b.cierre)}
        </dl>
      </div>
      <div className="note">{t('Acumulación negativa: el TK o los filtros entregan agua guardada (por ejemplo, durante el enjuague rápido los otros filtros bajan de nivel al recibir menos caudal por SEVI).')}</div>
    </div>
  );
}
