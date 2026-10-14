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
