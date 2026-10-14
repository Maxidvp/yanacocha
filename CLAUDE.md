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
| `data/causa_efecto.json` | Matriz causa-efecto (disparos T con reset del operador) |
| `docs/FALTANTES.md` | Contradicciones entre documentos y datos que siguen faltando |

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
- Falla segura: pérdida de 120VAC UPS o de 24VDC → todas las AI a 0 mA (falla de lazo), solenoides
  desenergizados; FV-603 cierra ante pérdida de aire o señal (aire-abre / resorte-cierra).
- Válvulas on/off Tipo V5: ante pérdida de aire **mantienen la última posición** (FL).
- Solo un filtro fuera de servicio a la vez (pendiente o en lavado/regeneración), según el permisivo documentado.
- Transiciones de la secuencia exactamente como en `proceso_y_logica.json` → `filtros.secuencia`;
  en los pasos 6 y 9 el timer es de falla (vencido sin alcanzar el nivel → HOLD).
- Los disparos "T" de la matriz causa-efecto quedan enclavados hasta reset del operador.
- Motores: selector Local/Off/Remoto; en Local solo JOG desde la LCS y quedan activos solo los
  interlocks de seguridad del equipo; el E-Stop actúa siempre.
- Incluir tests unitarios de la máquina de estados del filtro (recorrer los 17 pasos y verificar la
  matriz de válvulas), del cálculo de setpoint del bypass y del PID.

## Orden de trabajo sugerido
1. Cargar y tipar los JSON (`src/data/`), 2. Modelo de proceso + I/O, 3. Lógica PLC,
4. HMI resumen y detalle de filtro, 5. Resto de pantallas, 6. Escenarios de falla.
