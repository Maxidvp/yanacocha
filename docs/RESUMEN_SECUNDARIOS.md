# Datos rescatados de documentos secundarios – AWTP EAST

Este archivo resume lo que sirve para el simulador de los documentos que se retiraron del proyecto. Lo que no figura acá ya está en `data/*.json`, o no aporta al simulador: pintura, soldadura, transporte, planos de fabricación y todo lo de la planta WEST.

## Condiciones de sitio (RA Valves: especificación climática Bechtel 26280-220-3GS-M000-00003)
- **Elevación media**: 3600 m s.n.m. El valor de 4100 m que aparece en algunas hojas queda como contradicción (FALTANTES #10).
- **Temperatura ambiente**:
  - extremos absolutos: −9.4 °C y 26.3 °C;
  - estación Yanacocha: media 7.5 °C, máxima mensual 12–13 °C, mínima mensual 3–5 °C.
- **Viento máximo**: 54.2 m/s.
- **Aire de instrumentos de planta**: 550–690 kPa(g), nominal 690 kPa, seco y libre de aceite. El punto de rocío debe estar al menos 10 °C por debajo de la mínima ambiente.

## Requisitos de instrumentación (especificaciones del cliente dentro del RA)
- **Transmisores**: 4-20 mA + HART, preferentemente a 2 hilos y alimentados en lazo a 24 Vdc. Carga de 600 Ω o más.
- **Equipos a 4 hilos**: alimentación de 24 Vdc.
- **Fines de carrera**: inductivos (0.4 A, 24 Vdc) o mecánicos (2 A, 24 Vdc).
- **Contactos de relé de instrumentos**: 24 Vdc, 2 A, DPDT.
- **Bocinas y balizas**: 24 Vdc.
- **Velocidad de actuadores**, salvo indicación en contrario: 1 pulgada por segundo × diámetro nominal. En la práctica, el tiempo de carrera en segundos es aproximadamente igual al diámetro en pulgadas. El valor por defecto sugerido para el simulador es `tiempo_carrera_s = DN_pulg` (por ejemplo, una válvula de 12" tarda unos 12 s). Es ajustable, ya que el spec exige velocidad regulable en apertura y cierre.
  - Esto explica las falsas ZAO/ZAC: con un retardo de alarma de 10 s, toda válvula de más de 10" las dispara.

## FV-160305603 – curva de la válvula de bypass (VD cvcalcs EAST)
- **Válvula**:
  - Flowserve Valtek TX3, butterfly 12" CL150, trim de Cv 3808, característica lineal modificada;
  - actuador RG109, falla CERRADA, abre con aire;
  - posicionador 3822 con feedback 4-20 mA;
  - aire de suministro 4.14–8.97 bar(g).
- **Condiciones de proceso**: línea de 24" sch 40; P1 61.5 kPa(g); P2 10.8 kPa(g); ΔP 50.7 kPa; 26.3 °C.

| Caudal (m³/h) | Cv requerido | Apertura (%) |
|---|---|---|
| 230 | 375 | 15 |
| 265 | 433 | 17 |
| 615 | 1022 | 35 |
| 853 (máx, tope mecánico) | 1447 | 47 |

- **Modelo para el simulador**: Q ≈ f(apertura) interpolando la tabla de arriba con ΔP constante de 50.7 kPa. Para ΔP variable usar Cv(%)·√(ΔP/50.7).

## Consumo de servicios (utility demand schedule rev004)
- **Aire de instrumentos** (válvulas on/off y control): promedio 82 Nm³/h, pico 98 Nm³/h, a unos 550 kPa(g).
  - El promedio supone que cada válvula on/off de los 4 filtros cicla una vez por hora, más la modulación del bypass.
  - El pico es el promedio más un retrolavado.

## Medios filtrantes (104TC2 – por filtro / total para 4 filtros)
| Capa | Espesor (m) | m³/filtro | m³ total | m³ con reserva |
|---|---|---|---|---|
| Antracita 0.6–0.8 mm | 0.305 | 12 | 47.6 | 52.4 |
| GreensandPlus 0.30–0.35 mm | 0.925 | 36 | 144.5 | 151.6 |
| Grava #6×#12 | 0.050 | 1.95 | 7.8 | 9.4 |
| Grava 1/4"×1/8" | 0.075 | 2.93 | 11.7 | 14.1 |
| Grava 1/2"×1/4" | 0.075 | 2.93 | 11.7 | 14.1 |
| Grava 3/4"×1/2" | 0.100 | 3.90 | 15.6 | 18.7 |
| Grava 1 1/2"×3/4" | 0.150 | 5.86 | 23.4 | 26.9 |
| Grava 2 1/2"×1 1/2" | 0.150 | 5.86 | 23.4 | 25.7 |

- **Espesores totales**: grava 0.60 m (unos 23.4 m³ por filtro; el P&ID dice 12 m³ y el datasheet manda); greensand 0.925 m. La filosofía y el P&ID redondean a 305/915/610 mm.

## Pesos (plano de izaje 101 RIGGING)
- **Filtros FL-30035/36/37/38**: peso neto vacío de 41 900 kg cada uno; volumen de embarque de 263.7 m³ cada uno.

## Lubricación (lubsch EAST) – sólo para fichas de mantenimiento
- **AG-30006 (TK-30015)**: reductor con 17.5 L de Mobil SHC Gear 220 (ISO VG 220); rodamientos con Mobil Polyrex EM (NLGI 2), cada 20 000 h.
- **AG-30007 (TK-30016)**: reductor con 44 L de Mobil SHC Gear 220; rodamientos con Polyrex EM.
- **BL-30008/09 Hibon**: rodamientos con 13 L de Hibon Lube ISO VG 220 (equivalente Mobil SHC 630), cada 8000 h. Motor con Polyrex EM, 79 g.
- **CM-30011/12**: motor WEG de 37 kW a 3555 rpm (según lubsch). Rodamientos con Polyrex EM cada 2000 h.
  - **Atención**: este dato de potencia y velocidad del motor conviene cotejarlo con la hoja del motor del compresor.

## Blower (curva de performance EAST)
- **Punto de diseño**: 2688 Nm³/h (1712 SCFM) a ΔP 58.3 kPa(g); descarga a 119.13 kPa(a); 1448 rpm.
- **Límites**: velocidad máxima 1900 rpm; ΔP máxima 96.53 kPa(g).
- **Válvula de alivio (PRV)**: ajustada a 9.3 psig.

## Manómetros
- **PI-160305605/606**: presión de proceso 48.3 kPa; escala dual 0–100 kPa / 0–15 psi.
