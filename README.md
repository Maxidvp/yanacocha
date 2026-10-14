# Simulador AWTP EAST – Yanacocha

Simulador web del paquete **16045-PK-30006** (Aquatech P-00260 / Bechtel 26443): tanque de mezcla primario TK-30015, 4 filtros de medio activo por gravedad (greensand), soplantes de air scour, compresores de aireación, bypass FV-160305603 y post-tratamiento (TK-30016).

Corre entero en el navegador: modelo de proceso, capa de I/O y "PLC" con la filosofía de control rev005, más un HMI tipo SCADA para operarlo.

## Qué se puede hacer
| Pantalla | Contenido |
|---|---|
| Resumen de planta | Mímico del P&ID con estados (verde marcha/abierta, rojo parada/cerrada, ámbar falla), flujos animados y valores en vivo |
| Filtros A–D | Corte del filtro (medios, nivel, K06/K09, HH…LL), botones del PCS (Offline, Standby, Service, Backwash, Regeneration, Normal/Prolong, Step Advance, Hold, Resume, Auto/Semiauto), pasos 0–16 + HOLD, timers T03/K03, matriz de válvulas y muestra manual de Cl/ORP |
| Equipos rotativos | Compresores (MK5: PT-711, TT-703, aceite, devanados), soplantes, agitadores; duty/standby, L/O/R, A/M, LCS con JOG y E-Stop |
| Eléctrico | Unifilar 460 V / 220 V / 120 VAC UPS → 24 VDC, kW y A por carga, energía, costo, Wh/m³ |
| Corrientes y calidad | Tabla de corrientes tipo PFD: caudal, velocidad, Reynolds, P, T, pH, conductividad, turbidez, Fe, Mn, Cl₂, SO₄ |
| Vista de planta | Layout 26442-ST3-J2-16045-00001 (hojas 11 y 12) con estados en vivo |
| Lista de I/O | 102 puntos de la I/O list + señales de motor + interfaz con otros; valor, mA y forzado |
| Alarmas y C&E | Activas, historial, reconocimiento, matriz causa-efecto con disparos enclavados y reset |
| Tendencias | Historiador de 24 h, paneles por unidad, cursor, exportar CSV |
| Escenarios y fallas | 7 escenarios de operación, 10 fallas guiadas y parámetros editables marcados *A confirmar* / *Supuesto* |
| Fichas técnicas | Datos de equipos, instrumentos, válvulas y cargas, más la lista de pendientes |

## Uso
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 38 tests: secuencia de 17 pasos, consistencia filosofía/SOE/C&E, bypass, PID e integración
npm run build        # dist/
npm run build:single # dist-single/index.html autocontenido (un solo archivo)
```
Atajos: F1–F11 cambian de pantalla, Esc cierra el faceplate.

## Deploy (Firebase Hosting)
Cada push a `main` o a `claude/friendly-babbage-owfywt` ejecuta `.github/workflows/firebase-hosting.yml`: instala dependencias, corre typecheck y tests, compila y despliega `dist/` en Firebase Hosting.
- Requiere el secreto de repositorio `FIREBASE_SERVICE_ACCOUNT` con el JSON de una cuenta de servicio con rol *Firebase Hosting Admin*. El project ID se lee del JSON.
- También se puede lanzar a mano desde la pestaña Actions (*Run workflow*).
- Deploy local: `npm run build && npx firebase-tools deploy --only hosting --project <project-id>`.

## Arquitectura
- `data/` – fuente de verdad (JSON del paquete, `soe.json` de la C&E rev002 y `layout.json` digitalizado del plano de ubicación).
- `src/sim/process/` – modelo de proceso (ver `docs/MODELO.md`).
- `src/sim/io/` – tabla de I/O con escalado 4–20 mA (NAMUR NE43) y forzados.
- `src/sim/plc/` – secuencias de filtros, lógica maestra, FY/FIC-603, duty/standby, alarmas y C&E. Lee y escribe solo I/O.
- `src/ui/` – HMI (React + SVG + canvas). El estado de la UI vive en Zustand, separado del motor de simulación.

## Supuestos y pendientes
`docs/FALTANTES.md` reúne las contradicciones entre documentos y lo que aportó el simulador (referencia de K06/K09, carrera de válvulas vs retardo ZAO/ZAC, umbral del bypass, tags de PSV y otros). Cada supuesto es un parámetro editable en la app.
