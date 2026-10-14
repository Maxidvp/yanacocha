// "PLC": lee solo I/O, escribe solo I/O. Implementa secuencias de filtros, lógica maestra, bypass FIC/FY-603,
// duty/standby de compresores y soplantes, permisivos de agitadores, alarmas y matriz causa-efecto.
import { alarmas as alarmasDoc, causaEfecto, filtrosEquipo, valvulas, instrumentoPorTag, retardoAlarma, LETRA_FILTRO, FUNCIONES_VALVULA, type FuncionValvula } from '../../data';
import type { Params } from '../params';
import type { TablaIO } from '../io/iotable';
import type { Selector } from '../process/devices';
import { GestorAlarmas, type Prioridad } from './alarms';
import { BloqueMotor, BloqueValvula } from './blocks';
import { SecuenciaFiltro, type BotonFiltro, type CtxFiltro, type Valvulas } from './filterSeq';
import { PID } from './pid';

export type ComandoHMI =
  | { tipo: 'filtro'; filtro: number; boton: BotonFiltro }
  | { tipo: 'motor'; tag: string; accion: 'START' | 'STOP' | 'AUTO' | 'MANUAL' | 'RESET' }
  | { tipo: 'selector'; tag: string; valor: Selector }
  | { tipo: 'valvula'; tag: string; accion: 'ABRIR' | 'CERRAR' | 'AUTO' | 'MANUAL' }
  | { tipo: 'fic'; modo?: ModoFIC; salida?: number }
  | { tipo: 'ack'; id: string }
  | { tipo: 'ack_todas' }
  | { tipo: 'reset_disparos' }
  | { tipo: 'duty'; grupo: 'compresores' | 'soplantes'; tag: string }
  | { tipo: 'aireacion'; habilitada: boolean };

export type ModoFIC = 'PROGRAMA' | 'AUTO' | 'MANUAL';

export interface Disparo {
  efecto: string;
  texto: string;
  activo: boolean;
  causa: string | null;
  t: number | null;
}

const MOTORES = [
  { tag: '16045-AG-30006', secuencia: false },
  { tag: '16045-AG-30007', secuencia: false },
  { tag: '16045-BL-30008', secuencia: true },
  { tag: '16045-BL-30009', secuencia: true },
  { tag: '16045-CM-30011', secuencia: true },
  { tag: '16045-CM-30012', secuencia: true },
];

const AI_PLANTA = ['LIT-160305601', 'AIT-160305600', 'AIT-160305442', 'FIT-160305602', 'FIT-160305607', 'FIT-160305603', 'FZI-160305603', 'LIT-160305604', 'LIT-160305615', 'LIT-160305623', 'LIT-160305631'];

const num = (v: unknown, def: number) => (typeof v === 'number' ? v : def);

export class PLC {
  readonly alarmas = new GestorAlarmas();
  readonly motores = new Map<string, BloqueMotor>();
  readonly valvulas = new Map<string, BloqueValvula>();
  readonly filtros: SecuenciaFiltro[];
  readonly pid: PID;
  modoFIC: ModoFIC = 'PROGRAMA';
  salidaManualFIC = 0;
  salidaFIC = 0;
  autoEfectivoFIC = false;
  spFY = 0;
  entradaTK = 0;
  filtrosFuera = 0;
  capacidadFiltros = 0;
  dutyCompresor = '16045-CM-30011';
  dutySoplante = '16045-BL-30008';
  aireacionHabilitada = true;
  tk15Bajo = false;
  disparos: Record<string, Disparo> = {};
  pv: Record<string, { eu: number; mala: boolean; mA: number }> = {};
  t = 0;
  ciclos = 0;
  private cola: ComandoHMI[] = [];
  private fswBW = 0;

  constructor(
    private io: TablaIO,
    private p: Params,
  ) {
    for (const m of MOTORES) {
      const fts = alarmasDoc.digitales.find((d) => d.tag === `${m.tag}-FTS`)?.retardo_s ?? 5;
      this.motores.set(m.tag, new BloqueMotor(m.tag, fts, m.secuencia));
    }
    for (const v of valvulas) {
      if (!v.senales?.DO_cmd) continue;
      const filtro = v.filtro ? filtrosEquipo.findIndex((f) => f.tag === v.filtro) : null;
      const ret = alarmasDoc.digitales.find((d) => d.tag === `ZAO-${v.tag.replace('HV-', '')}`)?.retardo_s ?? 15;
      const b = new BloqueValvula(v.tag, v.funcion, filtro === -1 ? null : filtro, ret);
      if (v.tag === 'HV-160305646') b.modo = 'MANUAL'; // lógica A CONFIRMAR: solo manual
      this.valvulas.set(v.tag, b);
    }
    this.filtros = filtrosEquipo.map((f, i) => new SecuenciaFiltro(i, f.tag));
    this.pid = new PID(p.pid_Kc, p.pid_Ti, p.pid_Td, true);
    for (const [ef, texto] of Object.entries(causaEfecto.efectos)) {
      if (ef.includes('-')) continue; // E6-E9 son acciones "X"
      this.disparos[ef] = { efecto: ef, texto, activo: false, causa: null, t: null };
    }
    this.definirAlarmas();
  }

  setParams(p: Params) {
    this.p = p;
    this.pid.Kc = p.pid_Kc;
    this.pid.Ti = p.pid_Ti;
    this.pid.Td = p.pid_Td;
  }

  comando(c: ComandoHMI) {
    this.cola.push(c);
  }

  motor(tag: string) {
    return this.motores.get(tag)!;
  }

  valvulaFiltro(i: number, fn: FuncionValvula) {
    return this.valvulas.get(filtrosEquipo[i].valvulas[fn])!;
  }

  // ------------------------------------------------------------------
  private definirAlarmas() {
    const A = this.alarmas;
    const an = alarmasDoc.analogicas;
    const nivelTxt: Record<string, string> = { HH: 'muy alto', H: 'alto', L: 'bajo', LL: 'muy bajo' };
    const pri = (n: string): Prioridad => (n === 'HH' || n === 'LL' ? 'ALTA' : 'MEDIA');
    const letra = (tag: string) => tag.split('-')[0][0]; // L, A, F
    const def = (tag: string, n: string, texto: string, retardo: number, grupo: string, fuente = alarmasDoc.fuente) =>
      A.definir({ id: `${letra(tag)}A${n}-${tag.split('-')[1]}`, tag, texto, prioridad: pri(n), retardo, grupo, fuente });

    for (const tag of ['LIT-160305601', 'AIT-160305600', 'FIT-160305602', 'FIT-160305607', 'FIT-160305603']) {
      const d = an[tag];
      const serv = instrumentoPorTag(tag)?.servicio ?? tag;
      for (const n of ['HH', 'H', 'L', 'LL']) {
        if (d[n as 'HH'] === undefined) continue;
        def(tag, n, `${serv} – ${nivelTxt[n]}`, retardoAlarma(d, n), 'Proceso');
      }
    }
    def('AIT-160305442', 'H', 'Conductividad salida TK-30015 – alta (SP por Bechtel)', 30, 'Proceso');
    def('AIT-160305442', 'HH', 'Conductividad salida TK-30015 – muy alta (SP por Bechtel)', 5, 'Proceso');
    for (const n of ['HH', 'H', 'L', 'LL']) def('LIT-160305276', n, `Nivel TK-30016 – ${nivelTxt[n]} (SP por Bechtel)`, retardoAlarma(an['LIT-160305276'], n), 'Proceso');
    for (const n of ['HH', 'H', 'L', 'LL']) def('AIT-160305288', n, `pH TK-30016 – ${nivelTxt[n]} (SP por Bechtel)`, retardoAlarma(an['AIT-160305288'], n), 'Proceso');
    filtrosEquipo.forEach((f, i) => {
      const d = instrumentoPorTag(f.transmisor_nivel)?.alarmas as Record<string, unknown> | undefined;
      const ret = (d?.retardo_s ?? {}) as Record<string, number>;
      for (const n of ['HH', 'H', 'L', 'LL']) def(f.transmisor_nivel, n, `Nivel filtro ${LETRA_FILTRO[i]} (${f.tag}) – ${nivelTxt[n]}`, ret[n] ?? 5, `Filtro ${LETRA_FILTRO[i]}`);
      A.definir({ id: `${f.tag}-HOLD`, tag: f.tag, texto: `Filtro ${LETRA_FILTRO[i]} en HOLD`, prioridad: 'MEDIA', retardo: 0, grupo: `Filtro ${LETRA_FILTRO[i]}` });
      A.definir({ id: `${f.tag}-SA`, tag: f.tag, texto: `Filtro ${LETRA_FILTRO[i]}: enjuague cumplido – verificar ORP/Cl y dar Step Advance`, prioridad: 'BAJA', retardo: 0, grupo: `Filtro ${LETRA_FILTRO[i]}` });
    });
    for (const d of alarmasDoc.digitales) {
      const tag = d.tag.startsWith('Z') ? `HV-${d.tag.split('-')[1]}` : d.tag.replace(/-FTS$/, '');
      A.definir({ id: d.tag, tag, texto: d.descripcion, prioridad: 'MEDIA', retardo: 0, grupo: d.tag.startsWith('Z') ? 'Válvulas' : 'Motores', fuente: alarmasDoc.fuente });
    }
    for (const id of ['ZAO-160305646', 'ZAC-160305646']) {
      A.definir({ id, tag: 'HV-160305646', texto: `HV-160305646 falla al ${id.startsWith('ZAO') ? 'abrir' : 'cerrar'} (no está en alarm list)`, prioridad: 'BAJA', retardo: 0, grupo: 'Válvulas', fuente: 'supuesto' });
    }
    for (const m of MOTORES) {
      A.definir({ id: `${m.tag}-FLT`, tag: m.tag, texto: `${m.tag} falla MPR (sobrecarga / tierra / desbalance)`, prioridad: 'ALTA', retardo: 0, grupo: 'Motores', fuente: 'Señales MPR – P&ID nota 3' });
      A.definir({ id: `${m.tag}-CP`, tag: m.tag, texto: `${m.tag} sin tensión de control`, prioridad: 'MEDIA', retardo: 2, grupo: 'Motores', fuente: 'Señales MPR' });
    }
    for (const tag of AI_PLANTA) A.definir({ id: `${tag}-BAD`, tag, texto: `${tag} falla de lazo / fuera de rango (NE43)`, prioridad: 'ALTA', retardo: 2, grupo: 'Instrumentos', fuente: 'NAMUR NE43' });
    for (const [ef, d] of Object.entries(this.disparos)) A.definir({ id: `TRIP-${ef}`, tag: ef, texto: `Disparo ${ef}: ${d.texto} (requiere reset)`, prioridad: 'ALTA', retardo: 0, grupo: 'Causa-efecto', fuente: causaEfecto.fuente });
    A.definir({ id: 'EXT-FA-RETROLAVADO', tag: 'EXT-FI-RETROLAVADO', texto: 'Caudal de retrolavado alto/bajo (por otros)', prioridad: 'MEDIA', retardo: 10, grupo: 'Proceso', fuente: 'Filosofía rev005 – causas de Hold' });
    A.definir({ id: 'PAL-AIRE-INST', tag: 'IA', texto: 'Presión de aire de instrumentos < 550 kPag (sim)', prioridad: 'ALTA', retardo: 5, grupo: 'Servicios', fuente: 'utilityconsumptionlist (mín. 550 kPag)' });
    A.definir({ id: 'CM-MK5-VACIO', tag: '16045-CM-30011/12', texto: 'Compresor parado por el MK5 tras marcha en vacío', prioridad: 'BAJA', retardo: 0, grupo: 'Motores', fuente: 'Atlas Copco MK5' });
  }

  // ------------------------------------------------------------------
  private procesarComandos() {
    for (const c of this.cola.splice(0)) {
      switch (c.tipo) {
        case 'filtro':
          this.filtros[c.filtro]?.boton(c.boton);
          break;
        case 'motor': {
          const m = this.motores.get(c.tag);
          if (!m) break;
          if (c.accion === 'AUTO' && m.deSecuencia) m.modoAM = 'AUTO';
          if (c.accion === 'MANUAL' && m.deSecuencia) {
            m.modoAM = 'MANUAL';
            m.pedidoManual = m.run;
          }
          if (c.accion === 'START' && m.modoAM === 'MANUAL') m.pedidoManual = true;
          if (c.accion === 'STOP' && m.modoAM === 'MANUAL') m.pedidoManual = false;
          if (c.accion === 'RESET') m.reset();
          break;
        }
        case 'selector': {
          const m = this.motores.get(c.tag);
          if (m) m.selector = c.valor;
          break;
        }
        case 'valvula': {
          const v = this.valvulas.get(c.tag);
          if (!v) break;
          const paso = v.filtro !== null ? this.filtros[v.filtro].paso : 0;
          // Válvulas de filtro: manual solo con el filtro en OFFLINE (mantenimiento)
          const permiteManual = v.filtro === null || paso === 0;
          if (c.accion === 'MANUAL' && permiteManual) {
            v.modo = 'MANUAL';
            v.cmdManual = v.salida;
          }
          if (c.accion === 'AUTO') v.modo = 'AUTO';
          if ((c.accion === 'ABRIR' || c.accion === 'CERRAR') && v.modo === 'MANUAL') v.cmdManual = c.accion === 'ABRIR';
          break;
        }
        case 'fic':
          if (c.modo) this.modoFIC = c.modo;
          if (c.salida !== undefined) this.salidaManualFIC = Math.min(100, Math.max(0, c.salida));
          break;
        case 'ack':
          this.alarmas.reconocer(c.id);
          break;
        case 'ack_todas':
          this.alarmas.reconocerTodas();
          break;
        case 'reset_disparos':
          this.resetDisparos();
          for (const m of this.motores.values()) m.reset();
          break;
        case 'duty':
          if (c.grupo === 'compresores') this.dutyCompresor = c.tag;
          else this.dutySoplante = c.tag;
          break;
        case 'aireacion':
          this.aireacionHabilitada = c.habilitada;
          break;
      }
    }
  }

  private causaActiva(causa: string): boolean {
    const id = causa.split(' ')[0];
    return this.alarmas.activa(id);
  }

  private resetDisparos() {
    for (const d of Object.values(this.disparos)) {
      if (!d.activo) continue;
      const causas = causaEfecto.causas.filter((c) => c.efectos[d.efecto] === 'T');
      if (!causas.some((c) => this.causaActiva(c.causa))) {
        d.activo = false;
        d.causa = null;
        this.alarmas.info(`Reset de disparo ${d.efecto}`);
      }
    }
  }

  disparo(ef: string) {
    return this.disparos[ef]?.activo ?? false;
  }

  // ------------------------------------------------------------------
  scan(dt: number) {
    const io = this.io;
    const p = this.p;
    this.t += dt;
    this.ciclos++;
    this.alarmas.setTiempo(this.t);

    // 1. Lectura de entradas
    for (const m of this.motores.values()) m.leer(io);
    for (const v of this.valvulas.values()) v.leer(io);
    for (const tag of AI_PLANTA) this.pv[tag] = io.ai(tag);
    for (const tag of ['FIC-160305065', 'FIC-160304333', 'LIT-160305276', 'AIT-160305288', 'EXT-FI-RETROLAVADO', 'EXT-LI-TK30038']) this.pv[tag] = io.ai(tag);

    // 2. Comandos del HMI
    this.procesarComandos();

    // 3. Alarmas analógicas
    this.evaluarAlarmas(dt);

    // 4. Matriz causa-efecto (disparos T enclavados)
    for (const c of causaEfecto.causas) {
      if (!this.causaActiva(c.causa)) continue;
      for (const [ef, tipo] of Object.entries(c.efectos)) {
        if (tipo !== 'T') continue;
        const d = this.disparos[ef];
        if (d && !d.activo) {
          d.activo = true;
          d.causa = c.causa;
          d.t = this.t;
        }
      }
    }
    for (const [ef, d] of Object.entries(this.disparos)) this.alarmas.evaluar(`TRIP-${ef}`, d.activo, dt);

    // 5. Secuencias de filtros
    const blowers = ['16045-BL-30008', '16045-BL-30009'].map((t) => this.motor(t));
    const soplanteDisponible = !this.disparo('E10') && blowers.some((b) => b.modoAM === 'AUTO' && b.avl && !b.fts);
    const soplanteEnMarcha = blowers.some((b) => b.run);
    const bwAvl = io.di('EXT-PU-30407-08-AVL') && !this.disparo('E12');
    const bwRun = io.di('EXT-PU-30407-08-RUN');
    this.fswBW = bwRun ? this.fswBW + dt : 0;
    const qBW = this.pv['EXT-FI-RETROLAVADO'].eu;
    const caudalBWAlarma = this.alarmas.evaluar('EXT-FA-RETROLAVADO', this.fswBW > 20 && Math.abs(qBW - p.q_bw_m3h) > 0.15 * p.q_bw_m3h, dt, qBW);
    const regenAvl = io.di('EXT-PU-30169-70-AVL');
    const regenRun = io.di('EXT-PU-30169-70-RUN');
    const lit601 = this.pv['LIT-160305601'];
    if (!lit601.mala && lit601.eu < p.tk15_vertedero_mm) this.tk15Bajo = true;
    else if (lit601.eu > p.tk15_vertedero_mm + 50) this.tk15Bajo = false;

    this.filtros.forEach((f, i) => {
      const fe = filtrosEquipo[i];
      const zso = {} as Valvulas;
      const zsc = {} as Valvulas;
      let disc: string | null = null;
      for (const fn of FUNCIONES_VALVULA) {
        const b = this.valvulas.get(fe.valvulas[fn])!;
        zso[fn] = b.zso;
        zsc[fn] = b.zsc;
        if (b.zao || b.zac) disc = `${b.tag} ${b.zao ? 'ZAO' : 'ZAC'}`;
      }
      const lit = this.pv[fe.transmisor_nivel];
      const sufijo = fe.transmisor_nivel.split('-')[1];
      const ctx: CtxFiltro = {
        dt, p, litEU: lit.eu, litMala: lit.mala,
        lahh: this.alarmas.activa(`${p.lavado_por_LAH ? 'LAH' : 'LAHH'}-${sufijo}`), lal: this.alarmas.activa(`LAL-${sufijo}`),
        zso, zsc, discrepancia: disc, todos: this.filtros,
        soplanteDisponible, soplanteEnMarcha, bombaBWDisponible: bwAvl, bombaBWEnMarcha: bwRun, caudalBWAlarma,
        bombaRegenDisponible: regenAvl, bombaRegenEnMarcha: regenRun, nivelSumideroRegen: this.pv['EXT-LI-TK30038'].eu,
        tk15Bajo: this.tk15Bajo,
      };
      const habiaHold = f.hold;
      f.scan(ctx);
      if (habiaHold && !f.hold) for (const fn of FUNCIONES_VALVULA) this.valvulas.get(fe.valvulas[fn])!.resetDiscrepancia();
      this.alarmas.evaluar(`${f.tag}-HOLD`, f.hold, dt);
      this.alarmas.evaluar(`${f.tag}-SA`, f.paso === 15 && f.esperandoStepAdvance, dt);
      // Válvulas: fuera de OFFLINE vuelven a AUTO
      for (const fn of FUNCIONES_VALVULA) {
        const b = this.valvulas.get(fe.valvulas[fn])!;
        if (f.paso !== 0) b.modo = 'AUTO';
        b.cmdAuto = f.salida.valvulas[fn];
      }
    });

    // 6. Válvulas de servicios
    const v639 = this.valvulas.get('HV-160305639')!;
    v639.cmdAuto = this.filtros.some((f) => f.salida.pide639);
    for (const v of this.valvulas.values()) {
      v.actualizar(dt, io);
      const suf = v.tag.replace('HV-', '');
      if (this.alarmas.estados.has(`ZAO-${suf}`)) {
        this.alarmas.evaluar(`ZAO-${suf}`, v.zao, dt);
        this.alarmas.evaluar(`ZAC-${suf}`, v.zac, dt);
      }
    }

    // 7. Equipos rotativos
    const pulso = p.pulso_cmd_s;
    // Soplantes: duty arranca a pedido de la secuencia; standby si falla el duty
    const pideSoplante = this.filtros.some((f) => f.salida.pideSoplante);
    this.dutyStandby(dt, ['16045-BL-30008', '16045-BL-30009'], this.dutySoplante, pideSoplante, (b) => {
      if (this.disparo('E10')) return 'Disparo E10 (FAHH/FALL-160305607)';
      if (!b.run && !v639.zsc) return 'HV-160305639 abierta (P&ID nota 9)';
      return null;
    }, pulso);
    // Compresores: duty/standby 2×100 %
    this.dutyStandby(dt, ['16045-CM-30011', '16045-CM-30012'], this.dutyCompresor, this.aireacionHabilitada, () =>
      this.disparo('E13') ? 'Disparo E13 (FAHH/FALL-160305602)' : null, pulso);
    // Agitadores: solo arranque manual desde PCS
    this.motor('16045-AG-30006').actualizar(dt, io, false, this.disparo('E3') ? 'Disparo E3 (LAL-160305601)' : null, pulso);
    this.motor('16045-AG-30007').actualizar(dt, io, false, this.disparo('E11') ? 'Disparo E11 (LAL-160305276)' : null, pulso);
    for (const m of this.motores.values()) {
      this.alarmas.evaluar(`${m.tag}-FTS`, m.fts, dt);
      this.alarmas.evaluar(`${m.tag}-FLT`, m.flt, dt);
      this.alarmas.evaluar(`${m.tag}-CP`, !m.cp, dt);
    }

    // 8. Equipos por otros
    io.escribirCOM('EXT-PU-30407-08-REQ', !this.disparo('E12') && this.filtros.some((f) => f.salida.pideBW));
    io.escribirCOM('EXT-PU-30169-70-REQ', this.filtros.some((f) => f.salida.pideRegen));
    io.escribirCOM('EXT-PU-30236-37-REQ', this.filtros.some((f) => f.salida.pideNaOCl));
    io.escribirCOM('EXT-E1-STOP-RO', this.disparo('E1'));
    io.escribirCOM('EXT-E2-STOP-HDS', this.disparo('E2'));
    io.escribirCOM('EXT-E4-STOP-ACIDO', this.disparo('E4'));
    io.escribirCOM('EXT-E5-STOP-SODA', this.disparo('E5'));

    // 9. Bypass FY/FIC-160305603
    this.bypass(dt);
  }

  private dutyStandby(dt: number, tags: string[], duty: string, pedido: boolean, bloqueo: (b: BloqueMotor) => string | null, pulso: number) {
    const d = this.motor(duty);
    const s = this.motor(tags.find((t) => t !== duty)!);
    const dutyOk = d.modoAM === 'AUTO' && d.selector === 'REMOTO' && d.avl && !d.fts;
    const bd = bloqueo(d);
    const bs = bloqueo(s);
    d.actualizar(dt, this.io, pedido && dutyOk, bd, pulso);
    s.actualizar(dt, this.io, pedido && (!dutyOk || !!bd) && !bs, bs, pulso);
  }

  private bypass(dt: number) {
    const p = this.p;
    const fic065 = this.pv['FIC-160305065'].eu;
    const fic333 = this.pv['FIC-160304333'].eu;
    this.entradaTK = fic065 + fic333;
    this.filtrosFuera = this.filtros.filter((f) => f.paso === 0).length;
    const caps = [p.cap_0_fuera, p.cap_1_fuera, p.cap_2_fuera];
    this.capacidadFiltros = this.filtrosFuera < caps.length ? caps[this.filtrosFuera] : 0;
    this.spFY = Math.min(853, Math.max(0, this.entradaTK - this.capacidadFiltros));
    const fit = this.pv['FIT-160305603'];
    this.autoEfectivoFIC =
      this.modoFIC === 'AUTO' ||
      (this.modoFIC === 'PROGRAMA' && (this.entradaTK >= p.bypass_umbral_auto_m3h || (!!p.bypass_auto_si_sp && this.spFY > 0)));
    if (this.modoFIC === 'MANUAL') {
      this.salidaFIC = this.salidaManualFIC;
      this.pid.seguir(this.salidaFIC, this.spFY, fit.eu, 1280);
    } else if (this.autoEfectivoFIC) {
      if (!fit.mala) this.salidaFIC = this.pid.calcular(this.spFY, fit.eu, dt, 1280);
    } else {
      this.salidaFIC = 0;
      this.pid.seguir(0, this.spFY, fit.eu, 1280);
    }
    this.io.escribirAO('FCV-160305603', this.salidaFIC);
  }

  private evaluarAlarmas(dt: number) {
    const A = this.alarmas;
    const an = alarmasDoc.analogicas;
    const p = this.p;
    const compMarcha = this.motor('16045-CM-30011').run || this.motor('16045-CM-30012').run;
    const sopMarcha = this.motor('16045-BL-30008').run || this.motor('16045-BL-30009').run;
    const nivel = (tag: string, lim: Record<string, number | string | undefined>, span: number, inhib: Partial<Record<string, boolean>> = {}) => {
      const pv = this.pv[tag] ?? this.io.ai(tag);
      const suf = tag.split('-')[1];
      const l = tag[0];
      const db = span * 0.01;
      for (const n of ['HH', 'H', 'L', 'LL']) {
        const sp = lim[n];
        if (typeof sp !== 'number') continue;
        const id = `${l}A${n}-${suf}`;
        if (!A.estados.has(id)) continue;
        const activa = A.activa(id);
        const alto = n.startsWith('H');
        const cond = alto ? pv.eu >= (activa ? sp - db : sp) : pv.eu <= (activa ? sp + db : sp);
        A.evaluar(id, cond && !pv.mala, dt, pv.eu, inhib[n] ?? false);
      }
    };
    nivel('LIT-160305601', an['LIT-160305601'] as Record<string, number>, 6400);
    nivel('AIT-160305600', an['AIT-160305600'] as Record<string, number>, 14);
    nivel('FIT-160305602', an['FIT-160305602'] as Record<string, number>, 525, { L: !compMarcha, LL: !compMarcha });
    nivel('FIT-160305607', an['FIT-160305607'] as Record<string, number>, 4000, { L: !sopMarcha, LL: !sopMarcha });
    const fvAbierta = (this.pv['FZI-160305603']?.eu ?? 0) > 5;
    nivel('FIT-160305603', { H: num(an['FIT-160305603'].H, 768), L: num(an['FIT-160305603'].L, 235) }, 1280, { L: !fvAbierta });
    nivel('AIT-160305442', { H: p.ait442_H, HH: p.ait442_HH }, p.ait442_max);
    nivel('LIT-160305276', { HH: p.lit276_HH, H: p.lit276_H, L: p.lit276_L, LL: p.lit276_LL }, 11500);
    nivel('AIT-160305288', { HH: p.ait288_HH, H: p.ait288_H, L: p.ait288_L, LL: p.ait288_LL }, 14);
    this.filtros.forEach((f, i) => {
      const tag = filtrosEquipo[i].transmisor_nivel;
      const inh = !!p.inhibir_alarmas_nivel_lavado && !(f.paso >= 2 && f.paso <= 4);
      nivel(tag, alarmasDoc.filtros_nivel_mm, 2980, { HH: inh, H: inh, L: inh, LL: inh });
    });
    for (const tag of AI_PLANTA) A.evaluar(`${tag}-BAD`, this.pv[tag].mala, dt);
  }
}
