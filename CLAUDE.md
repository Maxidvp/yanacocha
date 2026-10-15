# Simulador web – AWTP EAST (Yanacocha) · Filtros por gravedad + post-tratamiento

Proyecto Aquatech P-00260 / Bechtel 26443 · Paquete 16045 (planta ESTE).
Este archivo es la especificación para Claude Code. **Leelo completo antes de escribir código.**

## Objetivo
Una aplicación web que simule la operación real de la planta: estado de equipos, señales de I/O,
lazos de control, secuencias automáticas (lavado y regeneración de filtros), alarmas e interlocks,
con un HMI tipo SCADA para que un operador o ingeniero de control la opere y pruebe.

## Fuente de verdad
Todos los datos de planta están en `data/` y **no deben inventarse ni copiarse a mano en el código**:
cargalos desde los JSON.

| Archivo | Contenido |
|---|---|
| `data/equipos.json` | Tanques, filtros, agitadores, compresores, soplantes (dimensiones, motores, interlocks) |
| `data/instrumentos.json` | Transmisores, rangos de calibración, alarmas H/HH/L/LL, PSV |
| `data/valvulas.json` | 28 válvulas on/off de filtros + bypass FV-603 + drenajes + manuales |
| `data/senales_io.json` | I/O list documentada (102 puntos: 11 AI, 1 AO, 60 DI, 30 DO) + señales de motor y modos Local/Off/Remoto |
| `data/electrico.json` | Lista de cargas, tensiones, tablero de instrumentos, JBs, estaciones locales |
| `data/proceso_y_logica.json` | **Filosofía de control rev005**: base de diseño, flujo, bypass FIC/FY-603, compresores, soplantes, agitadores, secuencia de filtros de 17 pasos con matriz de válvulas, parámetros T03…T16/K03/K06/K09, Hold/Resume, lógica maestra |
| `data/alarmas.json` | Lista de alarmas analógicas (con retardos y condición de activación) y digitales (falla al arrancar, ZAO/ZAC) |
| `data/causa_efecto.json` | Matriz causa-efecto (disparos T con reset del operador) – verificada contra el original (Training Manual pág. 57) |
| `data/senales_por_equipo.json` | **Nuevo v3.** Para cada equipo, instrumento y válvula: todas sus señales (AI/AO/DI/DO/COM/alimentación) con tag de la I/O list, **nombre lógico**, RIO, caja, bornes y cable |
| `data/soe.json` | Sequence of Operations Chart de la C&E rev002 (Training Manual pág. 58): válvulas, equipos comunes, presets y caudales por paso |
| `data/layout.json` | Posiciones (m) de equipos e instrumentos digitalizadas del layout 26442-ST3-J2-16045-00001 h.11/12 |
| `docs/FALTANTES.md` | Contradicciones entre documentos, datos que siguen faltando y hallazgos del simulador |
| `docs/RESUMEN_SECUNDARIOS.md` | Datos rescatados de documentos secundarios (sitio, specs del cliente, curva de FV-603, medios, blower) |
| `docs/MODELO.md` | Ecuaciones y supuestos del modelo de proceso implementado |

Los parámetros de la filosofía (T03…T16, K03/K06/K09) y todo valor marcado **A CONFIRMAR** deben quedar
como **parámetros editables** en la pantalla de configuración (con nominal/mín/máx), no hardcodeados, y la
UI debe marcar visualmente los valores A CONFIRMAR.

Los equipos "por otros" (bombas de retrolavado, regeneración, NaOCl, sumideros, controladores de caudal
de entrada FIC-160305065/160304333) se simulan como **fronteras simples**: bombas ideales que entregan el
caudal nominal cuando reciben ON, sumideros de capacidad infinita, y caudal de entrada al TK-30015 fijado
por el operador (escenarios 410 / 1472 / 1771 / 2032 / 2386 m³/h de la tabla de bypass).

## Stack sugerido
- Vite + React + TypeScript, sin backend (todo corre en el navegador).
- Estado de simulación en un store (Zustand) separado de la UI.
- SVG para el diagrama de proceso (mímico).
- Recharts (o similar) para tendencias.

## Arquitectura (mantener separadas estas capas)
1. **Modelo de proceso** (`src/sim/process/`): integración a paso fijo (dt = 0.5 s, con multiplicador
   de velocidad x1/x10/x60). Balances de volumen en TK-30015 y en cada filtro, caudales por válvulas
   abiertas, curva simple de soplante (2688 Nm³/h a 58.3 kPa; presión sube a 64 kPag si no hay salida
   → abre PSV), colmatación del filtro (pérdida de carga ∝ volumen filtrado → sube el nivel LIT).
2. **Capa de I/O** (`src/sim/io/`): tabla de tags exactamente como `senales_io.json`. Las AI se escalan
   4–20 mA ↔ unidad de ingeniería con los rangos de `instrumentos.json`. Las DI de finales de carrera
   cambian con el tiempo de carrera de la válvula (ambas en 0 durante el recorrido).
3. **Lógica de control / "PLC"** (`src/sim/plc/`): lee solo I/O y escribe solo I/O (como un PLC real).
   Implementa: lazo PID del bypass, duty/standby de compresores y soplantes, permisivos de agitadores,
   máquina de estados de cada filtro con las secuencias de `proceso_y_logica.json`, alarmas y
   detección de discrepancia de válvulas.
4. **HMI** (`src/ui/`): pantallas listadas abajo.

## Pantallas
1. **Resumen de planta**: mímico con TK-30015, compresores, colector de entrada, 4 filtros, soplantes,
   bypass FV-603, sumidero de agua filtrada, TK-30016. Colores: verde = marcha/abierta,
   rojo = parada/cerrada, ámbar = disparo/falla (convención del proyecto).
2. **Filtro (detalle A/B/C/D)**: 7 válvulas con estado de finales de carrera, nivel, paso de secuencia
   (0–16 + HOLD), timer del paso vs preset, tiempo de servicio acumulado, flag de regeneración requerida,
   y los botones del PCS de la filosofía: Offline, Standby, Service, Backwash, Regeneration,
   Normal/Prolong, Step Advance, Hold, Resume, Auto/Semiauto.
3. **Equipos rotativos**: agitadores, compresores, soplantes; Remoto/Local, arrancar/parar, JOG, E-Stop.
4. **Eléctrico**: diagrama unifilar simplificado 460V / 220V / 120VAC UPS → PK-30005JB → 24VDC, con
   kW consumidos en vivo según equipos en marcha (usar kW absorbidos de la lista de cargas).
5. **Lista de I/O en vivo**: tabla filtrable con valor actual, en mA para AI, y opción de forzar una señal.
6. **Alarmas**: activas + historial, reconocimiento.
7. **Tendencias**: niveles, caudales, pH, posición FV-603.
8. **Configuración / escenarios**: parámetros SUPUESTOS editables e inyección de fallas (válvula
   trabada, disparo de motor, pérdida de aire de instrumentos, falla de transmisor, falla 24VDC).

## Reglas de implementación
- Tags y nombres exactamente como en los JSON (ej. `HV-160305610-ZSO`).
- Alimentaciones (corregido en v3, ver `electrico.json` → `tablero_instrumentos` y `fallas_correctas`):
  el tablero 16045-PK-30005JB alimenta **solo** FIT-160305603. Los LIT de filtros se alimentan desde la AI
  del PLC del cliente; FIT-602/607 son loop powered desde el RIO; solenoides y finales de carrera usan 24 VDC
  del panel de I/O del cliente a través de las VJB. FV-603 cierra ante pérdida de aire o señal.
- Válvulas on/off Tipo V5: ante pérdida de aire **mantienen la última posición** (FL).
- Solo un filtro fuera de servicio a la vez (pendiente o en lavado/regeneración), según el permisivo documentado.
- Transiciones de la secuencia exactamente como en `proceso_y_logica.json` → `filtros.secuencia`;
  en los pasos 6 y 9 el timer es de falla (vencido sin alcanzar el nivel → HOLD).
- Los disparos "T" de la matriz causa-efecto quedan enclavados hasta reset del operador.
- Motores: selector Local/Off/Remoto; en Local solo JOG desde la LCS y quedan activos solo los
  interlocks de seguridad del equipo; el E-Stop actúa siempre.
- Incluir tests unitarios de la máquina de estados del filtro (recorrer los 17 pasos y verificar la
  matriz de válvulas), del cálculo de setpoint del bypass y del PID.

## Fichas y señales del equipo seleccionado (pedido v3)
1. **Ficha técnica completa**: al seleccionar cualquier equipo, instrumento o válvula, mostrar **todos** los
   campos que trae su objeto en el JSON, recorriéndolos de forma genérica (no una lista fija de campos), para
   que cualquier dato que se agregue al JSON aparezca solo. Hoy faltan, por ejemplo:
   - el fabricante, modelo y código completo de los caudalímetros;
   - la ficha de motor (FLA, rpm, carcasa, FS, eficiencia, fp);
   - los bornes, cables, protectores y planos.

   Agrupar en secciones: Identificación · Proceso · Instrumento/Motor · Conexionado · Documentos. Siempre
   mostrar la fuente.
2. **Panel de señales del elemento seleccionado** (en el faceplate y en la ficha): leer
   `senales_por_equipo.json` → `mapa[tag]` y mostrar una tabla agrupada por tipo (AI, AO, DI, DO,
   COM/Modbus, alimentación) con estas columnas:
   - nombre lógico y tag de la I/O list;
   - descripción, RIO, caja / bornes / cable;
   - valor en vivo (en unidades de ingeniería **y** mA para las AI; 0/1 con texto para las DI/DO);
   - estado de forzado y botón "Forzar…", más las alarmas asociadas (HH/H/L/LL o ZAO/ZAC) con su estado.

   Seleccionar un filtro lista sus 22 señales (LIT + 7 válvulas × 3). Seleccionar una válvula lista sus 3
   señales, y lo mismo para un motor, un compresor (incluye las variables Modbus del MK5) o un instrumento.
3. **Nombres lógicos**: usar `nombre_logico` como identificador principal en la UI (por ejemplo
   `HY-160305608`, `ZSO-160305608`) y mostrar el tag de la I/O list (`HV-160305608`, `HV-160305608-ZSO`)
   como secundario. Las señales de motor solo tienen `nombre_logico_propuesto`: mostrarlo con la marca
   "propuesto" hasta que lo confirme el programador del PCS.

## Correcciones de la revisión del sitio (yanacocha-awtp.web.app, 14-oct)
1. **Alarmas falsas ZAO/ZAC-160305639** al entrar y salir del paso 8. El tiempo de carrera simulado supera el
   retardo de alarma (10 s). La regla general: retardo de alarma ≥ tiempo de carrera + margen, para todas las válvulas.
2. **Fallas de alimentación**: reescribir los escenarios "Pérdida de 24 VDC" y "Pérdida de 120 VAC UPS" según
   `electrico.json` → `fallas_correctas`. Solo afectan a FIT-160305603 y por lo tanto al FIC-603. Agregar
   un escenario aparte, "Pérdida de 24 VDC del panel de I/O del cliente", con el efecto amplio. En la
   pantalla Eléctrico, el texto "Lazos 4–20 mA: LIT ×4, FIT-602, FIT-607 · 113 mA de 1300 mA" está mal:
   la fuente QUINT4 alimenta solo el Promag (MCB-201).
3. **Balance de masa en Fast Rinse**: con entrada de 1472 m³/h se vio 1160 filtrado + 467 a RO/RW. El caudal del
   SEVI del filtro que enjuaga debe salir del mismo colector de entrada; si no alcanza, debe bajar el nivel del TK-30015.
4. **TT-160305703 (descarga del compresor)** marca 148 °C; la hoja de datos dice 86–131 °C. Ajustar el modelo.
5. **Referencia del LIT de filtros**: el "cero LIT 1400 mm" deja LAL (280) por debajo del tope del medio
   (1830 mm sobre el fondo). Dejar el cero del LIT como parámetro A CONFIRMAR, con valor por defecto en el tope
   del medio (1830 mm), y que K06/K09 se interpreten de forma coherente. Mostrar en el detalle del filtro las
   dos escalas: sobre el fondo y LIT.
6. **Calidad por corriente**: el permeado RO no puede tener 1200 µS/cm ni 5 NTU. Usar valores por corriente
   (supuestos editables) o mostrar solo la mezcla.
7. **Accesibilidad**: las pestañas principales son `span`/`div`. Usar `<button role="tab">` dentro de
   `role="tablist"`, con `aria-selected`.
8. **Diagrama de Resumen**: a ~680 px de ancho se corta el filtro D. Escalar el SVG al contenedor
   (`viewBox` + `width:100%`) y agregar zoom/pan.
9. **Nombres RO/RW**: usar "RO/RW" en todas partes (la Lista de I/O decía "FRO"; ya corregido en el JSON).
10. **Timer del paso 3 (Service)**: debe mostrar T03 (tiempo desde el último lavado), no un timer
    independiente que se reinicia.
11. **Arranque de soplantes**: la hoja del motor dice arranque por VFD y la lista de cargas dice DOL. Simular
    DOL (6× FLA = 1350 A en la barra durante la aceleración) y marcarlo como A CONFIRMAR.

## Orden de trabajo sugerido
1. Cargar y tipar los JSON (`src/data/`), 2. Modelo de proceso + I/O, 3. Lógica PLC,
4. HMI resumen y detalle de filtro, 5. Resto de pantallas, 6. Escenarios de falla.

## Estado de la implementación
Implementado según este documento (ver `README.md`). Comandos: `npm run dev`, `npm test`, `npm run build`, `npm run build:single`.
- Mantener los tests en verde (`npm test`) y el typecheck (`npm run typecheck`) antes de commitear.
- Todo parámetro nuevo que no salga de los documentos va en `src/sim/params.ts` con estado `SUPUESTO` o `A_CONFIRMAR`.
- Versión en inglés en la ruta `/en` (`src/i18n/`): todo texto visible nuevo se envuelve con `t()` (interfaz), `td()` (valores de `data/`) o `ts()` (textos de la simulación) y lleva su traducción; `tests/i18n.test.ts` lo verifica.
- v3 implementada: fichas técnicas agrupadas y genéricas (`src/ui/common/Ficha.tsx`), panel de señales por elemento (`src/ui/common/PanelSenales.tsx`), nombres lógicos en la Lista de I/O y las 11 correcciones de la revisión del sitio (`tests/revision.test.ts`).
- `npm test` corre Vitest sin caché de módulos: el test de i18n expande `import.meta.glob` y una caché vieja ocultaría archivos nuevos.
