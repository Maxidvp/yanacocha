# Pendientes – AWTP EAST (rev. 5, tras P&ID, PFD, layout, verificación de la C&E y actualización v3)

## Resuelto con los documentos nuevos
- Filosofía de control rev005: secuencia de 17 pasos, timers/setpoints, Hold/Resume, lógica maestra, bypass.
- Caudales de diseño (443/590 m³/h por filtro, 1771 total, retrolavado 1562 m³/h, regeneración 137 m³/h).
- Ubicación de TK-30016 (aguas abajo del sumidero de agua filtrada; alimenta las bombas de retrolavado).
- Matriz causa-efecto y lista de alarmas con retardos.
- Señales de motor (Start/Stop/Running/Available + diagnóstico MPR) y modos Local/Off/Remoto.
- Válvulas on/off: falla en última posición (Tipo V5).

## Contradicciones que siguen abiertas
1. **FIT-160305603 alarmas**: alarm list FAH 235 / FAL 890 (parece invertido) vs índice H 768 / L 235.
2. **FIT-160305602 punto normal**: alarm list 523 Nm³/h, pero el compresor es de 350 Nm³/h y HH = 385.
3. **pH HH**: 7.0 (alarm list) vs 7.2 (índice). Se usó 7.0.
4. **T13 / T14**: SOE 1800 s / 60 s vs filosofía rev005 900 s / 300 s. Se usó la filosofía.
5. **Tags de bombas por otros**: regeneración PU-30169/30170 (filosofía) vs PU-30212/30213 (SOE), y la C&E rev002 asigna PU-30169/30170 a la **dosificación de ácido** (efecto 4). Retrolavado: PU-30407/30408 (filosofía, P&ID hoja 6 y C&E efecto 12) vs "PU-30263/302364" (SOE, errata).
6. **Nivel TK-30016**: LIT-160305276 (alarm list, C&E) vs LIT-160305545 (filosofía).
7. **AIRI/BWO cruzados** en encabezado de SOE y alarm list digital (610↔614). Se usaron los tags del P&ID.
8. **PSV compresores**: 123 kPag (índice) / 2 barg (datasheet) / 0.45 MPa (P&ID vendor).
9. **Volumen TK-30015**: 68 m³ (filosofía) vs 80 m³ (P&ID). Se usó 68.
10. **Altitud**: 3600 m vs 4100 m (la especificación climática de Bechtel da 3600 m, ver `RESUMEN_SECUNDARIOS.md`).
11. **Código del Promag FIT-160305603**: datasheet 5W4C3H-AAELH… vs índice 5W4C5H-AAFLH…
12. **Arranque de soplantes**: lista de cargas DOL vs hoja del motor WEG "VFD". Se simula DOL (6 × FLA = 1350 A en la barra durante la aceleración).
13. **Cajas de conexión**: lista de cargas 16045-JB001…JB005 vs planos as-built (FL-30035/36-JB, FL-30037/38-JB, 4 VJB, PK-30005JB). Se usan los planos.
14. **HV-160305639**: J6 la llama "Air blower flush valve"; el alarm list, "condensate drain valve".
15. **Válvulas Tipo V5**: el P&ID las define "simple efecto, falla última posición", pero tienen una sola bobina 4/5 vías: sin tensión de bobina van a CERRADA; sin aire quedan en la última posición (confirmado por Bechtel 8-may-25 en CRS de J6). Es lo que simula el modelo.

## Información que todavía no está en los documentos
- Lógica de la válvula de drenaje de compresores HV-160305646 (no figura en la filosofía).
- Caudal mínimo/máximo y lógica de la bomba de retrolavado (por otros; se simula como bomba ideal).
- Dimensiones/niveles de los sumideros (agua filtrada, desecho de retrolavado, regeneración) – por otros; se simulan como fronteras.
- Setpoint K12 (nivel sumidero de regeneración para recircular).
- ~~La matriz causa-efecto se reconstruyó desde texto~~ → **verificada** contra el original (ver abajo).
- Rango de calibración de los LIT de filtro: el alarm list remite a 26443-220-V1A-MLF0-00196 (EAST Radar Level Indicating Transmitter). Ese documento debería resolver la referencia de K06/K09 (hallazgo 1).
- Tiempo de carrera de las válvulas on/off: no hay valor medido. La especificación del cliente (dentro del RA Valves) fija 1 in/s × DN, así que el simulador usa `DN` segundos (parámetro `carrera_s_por_pulg`, A CONFIRMAR).
- **Nombres lógicos de motores** (Start/Stop/Running/Available/MPR): no están en ningún documento; el paquete trae una propuesta `16045-XX-NNNNN-M.<señal>` a confirmar con el programador del PCS (la UI la marca "propuesto").
- **Direccionamiento PLC** (slot/canal) de la I/O list: columnas vacías en rev003.

## Hallazgos del simulador (rev. 3)
Detectados al poner a correr juntos el modelo de proceso y la lógica. Cada uno es un parámetro editable en *Escenarios y fallas*.
1. **Referencia de K06 / K09** (actualizado en v3): K06 = 1825 mm y K09 = 3000 mm no pueden estar en la escala del LIT (0–2980 mm; servicio 1100–1500, HH 1763). Se leen **referidos al fondo del filtro**, con el cero del LIT en el **tope del medio (1830 mm)** por defecto (parámetro `z0_LIT_mm`, A CONFIRMAR). Así K06 → LIT ≈ −5 mm (drenaje hasta el tope del medio), K09 → LIT 1170 mm (nivel normal) y LAL/LALL (280/140 mm LIT) protegen el medio. El drenaje del paso 6 sale por SEVO, por lo que la cota efectiva de la salida de agua filtrada (`z_salida_filtrada_mm`, SUPUESTO 1430 mm) debe quedar por debajo de K06; el LIT lee hasta 3.8 mA (−37 mm) según NE43.
2. **Carrera de válvula vs retardo de discrepancia** (corregido en v3): el alarm list fija ZAO/ZAC en 15 s (10 s para HV-639) y la carrera es ≈ DN segundos (válvulas de 6–24″). Con carrera ≥ retardo cada maniobra daba ZAO/ZAC falsas (se vieron en ZAO/ZAC-160305639 al entrar y salir del paso 8). Regla aplicada: retardo efectivo = máx(retardo del alarm list, carrera + margen); margen `margen_discrepancia_s` (SUPUESTO 5 s).
3. **Umbral del bypass vs tabla de escenarios**: el texto dice "entrada < 2032 m³/h → FV al 0 %", pero la tabla incluye entrada 1219 m³/h con bypass 853 m³/h (2 filtros fuera + 1 en lavado). Con el texto literal, esos escenarios rebalsan TK-30015. Ver parámetro `bypass_auto_si_sp`.
4. **Capacidad con 1 filtro fuera y entrada < 2032**: con 1771 m³/h y un filtro en OFFLINE, el bypass queda cerrado y los 2 filtros restantes (más uno en lavado) reciben ~885 m³/h cada uno, por encima del máximo de 590 m³/h.
5. **Nivel de filtros a caudal máximo**: con 590 m³/h por filtro (3 en servicio + 1 en lavado a 1771 m³/h), los filtros sucios superan H/HH y piden lavado en cascada; el permisivo de un solo filtro fuera a la vez los encola en el paso 4.
6. **Caudal mínimo de rellenado**: con 410 m³/h de entrada (103 m³/h por filtro), el paso 9 tarda más que T09 = 540 s y el filtro entra en HOLD ("T09 vencido sin alcanzar K09").
7. **PSV de soplantes**: el layout 26442-ST3-J2-16045-00001 h.11 identifica las PSV de BL-30008/09 como PSV-160305644/645; el índice usa PSV-160305618/622, números que coinciden con HV-160305618 (BWO filtro B) y HV-160305622 (AIRI filtro B). Probable duplicación de lazo; confirmar.
8. **Elevaciones del layout**: los instrumentos están a EL. 4041–4056 m (cota de planta ≈ 4042 m, coherente con 0.608 bar(a) ≈ 4100 m). PI-160305605/606 y las PSV de soplantes figuran a EL. 3565 m, aparentemente un error de tipeo.
9. ~~**Bombas de regeneración**: el layout confirma PU-30169/30170~~ → **refutado** por la C&E rev002, que asigna PU-30169/30170 a la dosificación de ácido. El layout solo muestra que están junto a TK-30038 (por otros), sin decir su función. Ver contradicción 5.
10. **Dos compresores en marcha**: 2 × 350 Nm³/h superan FAHH-160305602 (385) en 3 s y la C&E (E13) dispara ambos. No hay un permisivo que impida arrancar el standby en manual con el duty en marcha.
11. **Estación de bypass (P&ID)**: FIT-160305603 está en la rama de la FV, entre VBF-309704 y VBF-309708; VBF-309709 rodea toda la estación. Con VBF-309709 abierta el caudal de bypass no se mide ni se controla, y el FIC ve solo la rama de la FV.
12. **Válvulas manuales de soplantes**: la lista de válvulas no dice a qué soplante pertenecen VCH-309710/309714 y VBF-309713/309717. Se asignaron por numeración consecutiva del tren (VCH-309710, PI-160305605 con VBA-309711/712 y VBF-309713 para BL-30008; VCH-309714, PI-160305606 con VBA-309715/716 y VBF-309717 para BL-30009). A CONFIRMAR con el P&ID.
13. **Estado inicial de las válvulas manuales**: la lista de válvulas indica "abierta" para todas, incluidos los drenajes y el rodeo VBF-309709. El simulador arranca con los drenajes y VBF-309709 cerrados (operación normal).

## Verificación con el Training Manual (rev. 4)
Fuente: P-00260-PD-PCE-trainingmanual-C(EAST) págs. 57 (matriz C&E), 58 (SOE) y 87–88 (alarm list).

**Confirmado**
- Matriz causa-efecto: las 15 causas y sus efectos (T/X) coinciden con la reconstrucción anterior. Se agregaron línea, instrumento, alarma impresa y P&ID de cada causa, más tag y P&ID de cada efecto (`data/causa_efecto.json`).
- SOE (`data/soe.json`): la matriz de válvulas de los 17 pasos + HOLD es idéntica a la de la filosofía rev005 (test automático). Equipos comunes: soplantes ST solo en el paso 7; bombas de retrolavado ON en el 10; regeneración ON en el 12–13; NaOCl ON en el 13; **HV-160305639 abierta solo en el paso 8 (Dwell) y cerrada en los pasos 5–16 y en HOLD**, lo que confirma la lógica implementada.
- Alarm list: setpoints, retardos y condiciones de activación ("Always" / "Either compressor/blower running") coinciden con `data/alarmas.json`.

**Nuevo / erratas del original**
1. **LAH vs LAHH para pedir lavado**: las filas 10–13 de la C&E describen "Level High-High" pero imprimen LAH-1603056xx (1613 mm). La filosofía usa LAHH (1763 mm). Ver el parámetro `lavado_por_LAH` (A CONFIRMAR).
2. **Compresores en la C&E**: el efecto 13 lista 16045-CM-30006/30005; el P&ID y la lista de cargas, CM-30011/30012.
3. **Bombas de soda**: la C&E identifica la dosificación de soda como 16045-PU-30210/30211 (efecto 5).
4. **Filas 8 y 9 de la C&E**: imprimen FAL-160305607 tanto para High-High como para Low-Low.
5. **Prefijo 10645** en lugar de 16045 en varios tags (AG-30006, AG-30007, FL-30035/36/37/38).
6. **SOE**: el caudal de aire figura como FIT-160305014 (es FIT-160305607) y la nota 5 remite a la filosofía de la planta **WEST**.
7. **Alarm list digital**: repite el cruce AIRI/BWO (610↔614) en los 4 filtros, y tiene alarmas mal asignadas (línea 24 ZAC-160305608 para ZSC-616; línea 30 ZAC-611 para ZSC-619; líneas 35–36 ZAO/ZAC-614 para HV-622; línea 43 ZAO-611 para ZSO-627). El simulador usa ZAO/ZAC con el número de cada válvula.
8. **Span de los LIT de filtro**: los porcentajes del alarm list (LAHH 63 % = 1763 mm, LAL 10 % = 280 mm, LALL 5 % = 140 mm) implican un span de ~2800 mm; el índice de instrumentos da 0–2980 mm.
9. **pH TK-30016 (AIT-160305288)**: el alarm list define AAHH/AAH/AAL/AALL "por Bechtel" con 15 s de retardo; se agregaron con setpoints A CONFIRMAR. LIT-160305276 usa retardos 3/5/5/3 s.

## Actualización v3 (revisión del sitio, 14-oct)
- **Alimentaciones**: según `electrico.json` → `fallas_correctas`, el tablero 16045-PK-30005JB (y el UPS de 120 VAC que lo alimenta) solo alimenta FIT-160305603; su pérdida deja al FIC-603 sin PV (mantiene la salida). La pérdida del 24 VDC del panel de I/O del cliente es otra falla: desenergiza solenoides, deja ZSO/ZSC en 0 y lleva a 0 mA los LIT de filtros.
- **Balance en el enjuague rápido**: la SEVI del filtro que enjuaga toma del mismo colector de entrada. El excedente de filtrada + RO/RW sobre la entrada sale del agua acumulada en los otros filtros, que bajan de nivel al recibir menos caudal. El Resumen muestra el balance con la acumulación.
- **TT-160305703**: con el rendimiento efectivo `comp_eta` (SUPUESTO 0.92) la descarga queda en ≈ 84–132 °C entre los extremos de ambiente del sitio, en línea con la hoja de datos (86–131 °C).
- **Calidad por corriente**: la calidad documentada es la de la mezcla. El permeado RO usa supuestos editables y el agua HDS sale por diferencia, de modo que con los caudales de diseño la mezcla da los valores documentados.

