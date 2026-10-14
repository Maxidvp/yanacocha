# Modelo de proceso del simulador

Resumen de las ecuaciones y supuestos del modelo (`src/sim/process/`). Los coeficientes marcados SUPUESTO se pueden editar en la pantalla *Escenarios y fallas*.

## Integración
- Paso fijo dt = 0.5 s; velocidades ×1, ×10, ×60 y ×300, más "+1 h" para avanzar de golpe.
- Orden de cada paso: planta (campo) → tabla de I/O → PLC (scan). El PLC solo lee y escribe I/O.

## TK-30015
- Tanque abierto D = 4.3 m (14.52 m²). Balance: dL/dt = (Q_entrada − Q_filtros − Q_bypass − Q_rebalse − Q_drenaje)/A.
- Salida a filtros por la caja de salida (vertedero, SUPUESTO cresta 5000 mm): Q = Cw·(L − L_vert)^1.5, con Cw calibrado para 1771 m³/h a 5536 mm (nivel normal).
- Bypass N12: Q = 853·(posición FV)^1.15·√(carga/carga_nominal), con tope mecánico de 853 m³/h. La FV es aire-abre/resorte-cierra con un actuador de 1er orden.
- Estación de bypass según el P&ID: VBF-309704 → VBA-309705 → FIT-160305603 → FV-160305603 → VBA-309707 → VBF-309708, con VBF-309709 (24″) en paralelo a toda la estación. Con VBF-309704 o VBF-309708 cerrada no pasa caudal por la FV. VBF-309709 abierta deja pasar 1300·√(carga/carga_nominal) m³/h que la FIT no mide y el FIC no controla. Cada drenaje VBA de ½″ abierto saca `q_drenaje_bypass_m3h` (SUPUESTO 8 m³/h) con la línea cargada desde el TK (VBF-309704 abierta); el de aguas abajo de la FV solo si la FV deja pasar, y ese caudal sí lo ve la FIT.
- Rebalse N11 a 6250 mm (SUPUESTO).

## Filtros (4 × 25 %)
- Área 39.04 m², alto 4938 mm. Nivel h sobre el fondo; el LIT mide h − z0 (z0 = 1400 mm, SUPUESTO).
- La entrada SEVI reparte el caudal del colector por igual entre los filtros con SEVI abierta.
- Salida SEVO o RO/RW por gravedad: Q = apertura·(h − z0)/R, con R = R₀·(1 + α·M), donde M son los sólidos retenidos (kg).
  R₀ = 2.4 mm/(m³/h) y α = 0.007 1/kg (SUPUESTO) dan ~1060 mm limpio a 443 m³/h y LAHH a ~28 h con 5 NTU.
- Captura de sólidos: SST = 1.5·NTU + 1.91·Fe + 1.58·Mn; eficiencia 94 % × maduración, con caída por ruptura cuando R/R₀ > 1.9.
- Air scour "afloja" el lecho; el retrolavado desprende sólidos con un volumen característico de 220 m³ sin aire y 90 m³ con lecho aflojado. Los sólidos salen por BWO o vuelven a sedimentar en reposo.
- Greensand: capacidad oxidativa (kg de Mn) que consume la remoción de Mn/Fe y repone el NaOCl en la regeneración (1.3 kg Cl₂ por kg de Mn). La eficiencia de remoción de Mn cae por debajo del 30 % de capacidad.
- Cloro libre: balance de masa en el agua del filtro (sobre el medio + poros), con demanda de 1er orden; la muestra manual del paso 15 informa Cl y un ORP estimado.

## Aire
- Soplantes de desplazamiento positivo (2688 Nm³/h). La presión del colector se resuelve por bisección entre las salidas abiertas (AIRI, HV-639 y PSV a 64 kPag). La carga estática es la columna de agua sobre el distribuidor; queda calibrado a 58.3 kPa tras el drenaje.
- Tren de descarga de cada soplante: retención VCH (abre sola con caudal), mariposa VBF de descarga y manómetro PI con aislamiento y venteo (VBA). Con la VBF cerrada el soplante en marcha trabaja contra su propia PSV (≈ 64 kPag) y no aporta aire al colector; FIT-160305607 ve caudal cero y FALL-160305607 dispara E10 a los 30 s. El manómetro lee la descarga con el aislamiento abierto y el venteo cerrado, retiene la última presión si se aísla y lee 0 si se ventea.
- Temperatura de descarga adiabática con η = 0.55 a 0.608 bar(a) (≈ 122 °C de diseño).
- Compresores Atlas Copco: estados MK5 (arranque en vacío 10 s, carga, descarga por presión y parada tras marcha en vacío). La presión de descarga es la columna de TK-30015 más la pérdida del difusor (≈ 102 kPa).

## Química
- Sistema carbonato (K1, K2, Kw según la temperatura; sin corrección de actividad). El pH se calcula a partir de la alcalinidad y del carbono inorgánico total.
- Dosificación por otros: PI de H₂SO₄/NaOH sobre AIT-600 hacia SP 6.5. El stripping de CO₂ es proporcional al aire de los compresores.
- Conductividad: aporte iónico de ácido y soda. Sulfato: aporte del H₂SO₄.

## Fronteras (por otros)
- Bombas ideales: retrolavado 1562 m³/h, regeneración 137 m³/h, NaOCl 783 L/h. Sumideros de regeneración (120 m³) y desecho de retrolavado (450 m³) con evacuación automática SUPUESTA.
- TK-30016: las bombas de liberación (por otros) controlan el nivel con un PI a 7000 mm y entregan agua a las bombas de retrolavado.

## Eléctrico
- kW por carga según el estado del equipo, con los kW absorbidos de la lista de cargas. Soplantes: P ∝ Q·Δp. Compresores: 30 % en vacío.
- Arranque DOL: corriente ≈ 6 × FLA hasta 85 % de velocidad. Temperatura de devanado de 1er orden.
- Barra 460 V: kVA con fp 0.88; 24 VDC: suma de las corrientes de lazo de los transmisores de 2 hilos.
