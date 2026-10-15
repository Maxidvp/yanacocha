// Ficha técnica completa: recorre de forma genérica TODOS los campos del objeto del JSON (los que se agreguen
// aparecen solos), los agrupa en Identificación · Proceso · Instrumento/Motor · Conexionado · Documentos y
// muestra los objetos anidados (ficha de motor, conexionado, bornes, nombres lógicos…) como bloques clave/valor.
import { Fragment } from 'react';
import { esAConfirmar, type Json } from '../../data';
import { campo, t, td } from '../../i18n';

export type SeccionFicha = 'Identificación' | 'Proceso' | 'Instrumento/Motor' | 'Conexionado' | 'Documentos';
const ORDEN: SeccionFicha[] = ['Identificación', 'Proceso', 'Instrumento/Motor', 'Conexionado', 'Documentos'];

const REGLAS: [SeccionFicha, RegExp][] = [
  ['Documentos', /^(fuente|datasheet|plano|planos|pid|documento|documentos|nota|notas|notas_originales|referencia|referencias|ficha|lubricacion)(_|$)/],
  ['Conexionado', /^(rio|caja|cajas|jb|bornes|borne|cable|cables|conexionado|cableado|alimentacion|alimentaciones|proteccion_rayo|senal|senales|senales_logicas|nombres_logicos|estacion_local|estaciones_locales|lcs|sap|tablero|finales_carrera|bornes_transmisor|modulo_rio)(_|$)/],
  ['Instrumento/Motor', /^(fabricante|modelo|codigo|motor|motor_ficha|carcasa|salida|precision|rango_instrumento|display|opciones|accesorio|accesorios|solenoide|actuador|posicionador|valvula|volante|tamano_in|cv_req|caracteristica|tiempo_carrera|arranque|kW|potencia|rpm|fp|ef|V|FLA|impulsores|difusor|calefactor|ventilador|lamparas|escala|tarado|psv|aislacion|logica_vendor|conexion_proceso|linea|material|peso|controlador|falla_aire|falla_segura|tope_mecanico|frecuencia)(_|$)/i],
  ['Proceso', /^(proceso|caudal|caudales|presion|temp|nivel|niveles|volumen|dimensiones|area|medios|capacidad|dp|fluido|producto|normal|alarmas|rango|consumo|dosis|velocidad|servicio_|control|interlock|estado_inicial|aireacion|aire|retrolavado|recirculacion|salida_a_filtros|succion|descarga|drenaje|llenado|entrada|diseno|promedio|optimista|minimo|max|min|nominal)/i],
  ['Identificación', /^(tag|nombre|tipo|descripcion|desc|funcion|equipo|filtro|servicio|item|clase|ubicacion|igual_a|cantidad|sistema|alcance|activa)/],
];

/** Sección de un campo según su nombre; los desconocidos van a Identificación (nunca se descartan). */
export function seccionDe(k: string): SeccionFicha {
  for (const [s, re] of REGLAS) if (re.test(k)) return s;
  if (/(_kW|_A|_rpm|_HP|_Hz)$/.test(k)) return 'Instrumento/Motor';
  if (/(_m3h|_Nm3h|_kPa|_kPag|_barg|_C|_mm|_m|_m2|_m3|_Lh|_s|_pct|_min)$/.test(k)) return 'Proceso';
  return 'Identificación';
}

const TITULO: Record<SeccionFicha, string> = {
  'Identificación': 'Identificación',
  'Proceso': 'Proceso',
  'Instrumento/Motor': 'Instrumento / motor',
  'Conexionado': 'Conexionado',
  'Documentos': 'Documentos',
};

/** Valor de un campo: texto traducido, número, lista o bloque anidado (recursivo). */
function Valor({ v, nivel }: { v: Json | undefined; nivel: number }) {
  if (v === null || v === undefined) return <>—</>;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || x === null)) return <>{v.map((x) => (typeof x === 'string' ? td(x) : String(x))).join(' · ')}</>;
    return (
      <div className="stack" style={{ gap: 4 }}>
        {v.map((x, k) => (
          <div key={k} className="ficha-anidada">
            <Valor v={x} nivel={nivel + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof v === 'object') {
    return (
      <dl className="kv ficha-kv anidada">
        {Object.entries(v).map(([k, x]) => (
          <Fragment key={k}>
            <dt>{campo(k)}</dt>
            <dd><Valor v={x} nivel={nivel + 1} /> {typeof x === 'string' && esAConfirmar(x) && <span className="badge A_CONFIRMAR">{t('A confirmar')}</span>}</dd>
          </Fragment>
        ))}
      </dl>
    );
  }
  if (typeof v === 'string') return <>{td(v)}</>;
  if (typeof v === 'boolean') return <>{v ? t('sí') : t('no')}</>;
  return <>{String(v)}</>;
}

export function Ficha({ datos, excluir = [] }: { datos: Record<string, Json | undefined>; excluir?: string[] }) {
  // la fuente se muestra siempre al pie (no se repite en Documentos)
  const filas = Object.entries(datos).filter(([k, v]) => v !== undefined && k !== 'fuente' && !excluir.includes(k) && !k.startsWith('_'));
  const fuente = datos.fuente;
  const plano = (v: Json | undefined) => typeof v !== 'object' || v === null || (Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null));
  return (
    <div className="stack ficha" style={{ gap: 6 }}>
      {ORDEN.map((sec) => {
        const campos = filas.filter(([k]) => seccionDe(k) === sec);
        if (!campos.length) return null;
        return (
          <section key={sec}>
            <div className="ficha-sec">{t(TITULO[sec])}</div>
            <dl className="kv ficha-kv">
              {campos.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{campo(k)}</dt>
                  <dd>
                    <Valor v={v} nivel={0} /> {plano(v) && esAConfirmar(JSON.stringify(v)) && <span className="badge A_CONFIRMAR">{t('A confirmar')}</span>}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        );
      })}
      <div className="dim" style={{ fontSize: '0.76rem' }}>
        {t('Fuente')}: {fuente !== undefined && fuente !== null ? <Valor v={fuente} nivel={0} /> : t('lista del paquete (data/)')}
      </div>
    </div>
  );
}
