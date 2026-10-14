# Pendientes – AWTP EAST (rev. 2, tras P&ID, PFD y Training Manual)

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
5. **Tags de bombas por otros**: regeneración PU-30169/30170 (filosofía) vs PU-30212/30213 (SOE); retrolavado PU-30407/30408 vs "PU-30263/302364" (SOE).
6. **Nivel TK-30016**: LIT-160305276 (alarm list, C&E) vs LIT-160305545 (filosofía).
7. **AIRI/BWO cruzados** en encabezado de SOE y alarm list digital (610↔614). Se usaron los tags del P&ID.
8. **PSV compresores**: 123 kPag (índice) / 2 barg (datasheet) / 0.45 MPa (P&ID vendor).
9. **Volumen TK-30015**: 68 m³ (filosofía) vs 80 m³ (P&ID). Se usó 68.
10. **Altitud**: 3600 m vs 4100 m.

## Información que todavía no está en los documentos
- Lógica de la válvula de drenaje de compresores HV-160305646 (no figura en la filosofía).
- Caudal mínimo/máximo y lógica de la bomba de retrolavado (por otros; se simula como bomba ideal).
- Dimensiones/niveles de los sumideros (agua filtrada, desecho de retrolavado, regeneración) – por otros; se simulan como fronteras.
- Setpoint K12 (nivel sumidero de regeneración para recircular).
- La matriz causa-efecto se reconstruyó desde texto: conviene verificarla contra el PDF.
- Tiempo de carrera de las válvulas on/off (se ajusta con el silenciador de escape; se sugiere 10–30 s como parámetro editable).

## Hallazgos del simulador (rev. 3)
Detectados al poner a correr juntos el modelo de proceso y la lógica. Cada uno es un parámetro editable en *Escenarios y fallas*.
1. **Referencia de K06 / K09**: K06 = 1825 mm y K09 = 3000 mm no pueden estar en la escala del LIT (0–2980 mm; servicio 1100–1500, HH 1763): el drenaje terminaría al instante y el rellenado no terminaría nunca (3000 > 2980). Se interpretan **referidos al fondo del filtro**, con el cero del LIT a 1400 mm sobre el fondo (supuesto `z0_LIT_mm`). Así K06 → LIT 425 mm (≈ "300–500 mm sobre el medio") y K09 → LIT 1600 mm (tope del rango normal). A CONFIRMAR con Aquatech.
2. **Carrera de válvula vs retardo de discrepancia**: el alarm list fija ZAO/ZAC a 15 s y la lista de válvulas sugiere carreras de 10–30 s. Con carrera ≥ 15 s cada maniobra genera ZAO/ZAC y el filtro entra en HOLD por dispositivo. Se usa 12 s por defecto. La carrera real debe quedar por debajo del retardo, o hay que subir el retardo.
3. **Umbral del bypass vs tabla de escenarios**: el texto dice "entrada < 2032 m³/h → FV al 0 %", pero la tabla incluye entrada 1219 m³/h con bypass 853 m³/h (2 filtros fuera + 1 en lavado). Con el texto literal, esos escenarios rebalsan TK-30015. Ver parámetro `bypass_auto_si_sp`.
4. **Capacidad con 1 filtro fuera y entrada < 2032**: con 1771 m³/h y un filtro en OFFLINE, el bypass queda cerrado y los 2 filtros restantes (más uno en lavado) reciben ~885 m³/h cada uno, por encima del máximo de 590 m³/h.
5. **Nivel de filtros a caudal máximo**: con 590 m³/h por filtro (3 en servicio + 1 en lavado a 1771 m³/h), los filtros sucios superan H/HH y piden lavado en cascada; el permisivo de un solo filtro fuera a la vez los encola en el paso 4.
6. **Caudal mínimo de rellenado**: con 410 m³/h de entrada (103 m³/h por filtro), el paso 9 tarda más que T09 = 540 s y el filtro entra en HOLD ("T09 vencido sin alcanzar K09").
7. **PSV de soplantes**: el layout 26442-ST3-J2-16045-00001 h.11 identifica las PSV de BL-30008/09 como PSV-160305644/645; el índice usa PSV-160305618/622, números que coinciden con HV-160305618 (BWO filtro B) y HV-160305622 (AIRI filtro B). Probable duplicación de lazo; confirmar.
8. **Elevaciones del layout**: los instrumentos están a EL. 4041–4056 m (cota de planta ≈ 4042 m, coherente con 0.608 bar(a) ≈ 4100 m). PI-160305605/606 y las PSV de soplantes figuran a EL. 3565 m, aparentemente un error de tipeo.
9. **Bombas de regeneración**: el layout h.12 muestra PU-30169/30170 dentro de TK-30038, lo que confirma los tags de la filosofía frente a la SOE (PU-30212/30213).
10. **Dos compresores en marcha**: 2 × 350 Nm³/h superan FAHH-160305602 (385) en 3 s y la C&E (E13) dispara ambos. No hay un permisivo que impida arrancar el standby en manual con el duty en marcha.
