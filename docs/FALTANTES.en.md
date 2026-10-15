# Open items – AWTP EAST (rev. 5, after P&ID, PFD, layout, C&E verification and the v3 update)

## Resolved with the new documents
- Control philosophy rev005: 17-step sequence, timers/setpoints, Hold/Resume, master logic, bypass.
- Design flows (443/590 m³/h per filter, 1771 total, backwash 1562 m³/h, regeneration 137 m³/h).
- Location of TK-30016 (downstream of the filtered water sump; feeds the backwash pumps).
- Cause & effect matrix and alarm list with delays.
- Motor signals (Start/Stop/Running/Available + MPR diagnostics) and Local/Off/Remote modes.
- On/off valves: fail in last position (Type V5).

## Contradictions still open
1. **FIT-160305603 alarms**: alarm list FAH 235 / FAL 890 (looks swapped) vs index H 768 / L 235.
2. **FIT-160305602 normal point**: alarm list 523 Nm³/h, but the compressor is 350 Nm³/h and HH = 385.
3. **pH HH**: 7.0 (alarm list) vs 7.2 (index). 7.0 is used.
4. **T13 / T14**: SOE 1800 s / 60 s vs philosophy rev005 900 s / 300 s. The philosophy is used.
5. **Tags of pumps by others**: regeneration PU-30169/30170 (philosophy) vs PU-30212/30213 (SOE), and C&E rev002 assigns PU-30169/30170 to **acid dosing** (effect 4). Backwash: PU-30407/30408 (philosophy, P&ID sheet 6 and C&E effect 12) vs "PU-30263/302364" (SOE, typo).
6. **TK-30016 level**: LIT-160305276 (alarm list, C&E) vs LIT-160305545 (philosophy).
7. **AIRI/BWO swapped** in the SOE header and the digital alarm list (610↔614). The P&ID tags are used.
8. **Compressor PSVs**: 123 kPag (index) / 2 barg (datasheet) / 0.45 MPa (vendor P&ID).
9. **TK-30015 volume**: 68 m³ (philosophy) vs 80 m³ (P&ID). 68 is used.
10. **Altitude**: 3600 m vs 4100 m (the Bechtel climatic specification gives 3600 m, see `RESUMEN_SECUNDARIOS.md`).
11. **Promag FIT-160305603 order code**: datasheet 5W4C3H-AAELH… vs index 5W4C5H-AAFLH…
12. **Blower starting**: load list DOL vs WEG motor sheet "VFD". DOL is simulated (6 × FLA = 1350 A on the bus during acceleration).
13. **Junction boxes**: load list 16045-JB001…JB005 vs as-built drawings (FL-30035/36-JB, FL-30037/38-JB, 4 VJB, PK-30005JB). The drawings are used.
14. **HV-160305639**: J6 calls it "Air blower flush valve"; the alarm list, "condensate drain valve".
15. **Type V5 valves**: the P&ID defines them as "single acting, fail last position", but they have a single 4/5-way coil: with the coil de-energized they go CLOSED; without air they stay in last position (confirmed by Bechtel 8-May-25 in the J6 CRS). That is what the model simulates.

## Information still missing from the documents
- Logic of the compressor drain valve HV-160305646 (not in the philosophy).
- Minimum/maximum flow and logic of the backwash pump (by others; simulated as an ideal pump).
- Dimensions/levels of the sumps (filtered water, backwash waste, regeneration) – by others; simulated as boundaries.
- Setpoint K12 (regeneration sump level to recirculate).
- ~~The cause & effect matrix was rebuilt from text~~ → **verified** against the original (see below).
- Calibration range of the filter LITs: the alarm list refers to 26443-220-V1A-MLF0-00196 (EAST Radar Level Indicating Transmitter). That document should settle the K06/K09 reference (finding 1).
- Stroke time of the on/off valves: no measured value. The client specification (inside the RA Valves) sets 1 in/s × DN, so the simulator uses `DN` seconds (parameter `carrera_s_por_pulg`, TO BE CONFIRMED).
- **Motor logical names** (Start/Stop/Running/Available/MPR): not in any document; the package brings a proposal `16045-XX-NNNNN-M.<signal>` to be confirmed with the PCS programmer (the UI marks it "proposed").
- **PLC addressing** (slot/channel) of the I/O list: empty columns in rev003.

## Simulator findings (rev. 3)
Found by running the process model and the logic together. Each one is an editable parameter in *Scenarios and faults*.
1. **K06 / K09 reference** (updated in v3): K06 = 1825 mm and K09 = 3000 mm cannot be on the LIT scale (0–2980 mm; service 1100–1500, HH 1763). They are read as **referenced to the filter floor**, with the LIT zero at the **top of the media (1830 mm)** by default (parameter `z0_LIT_mm`, TO BE CONFIRMED). So K06 → LIT ≈ −5 mm (drain down to the top of the media), K09 → LIT 1170 mm (normal level) and LAL/LALL (280/140 mm LIT) protect the media. Step 6 drains through SEVO, so the effective filtered water outlet elevation (`z_salida_filtrada_mm`, ASSUMPTION 1430 mm) must be below K06; the LIT reads down to 3.8 mA (−37 mm) per NE43.
2. **Valve stroke vs discrepancy delay** (fixed in v3): the alarm list sets ZAO/ZAC at 15 s (10 s for HV-639) and the stroke is ≈ DN seconds (6–24″ valves). With stroke ≥ delay every operation raised false ZAO/ZAC (seen on ZAO/ZAC-160305639 entering and leaving step 8). Rule applied: effective delay = max(alarm list delay, stroke + margin); margin `margen_discrepancia_s` (ASSUMPTION 5 s).
3. **Bypass threshold vs scenario table**: the text says "inflow < 2032 m³/h → FV at 0 %", but the table includes 1219 m³/h inflow with 853 m³/h bypass (2 filters out + 1 washing). With the literal text, those scenarios overflow TK-30015. See parameter `bypass_auto_si_sp`.
4. **Capacity with 1 filter out and inflow < 2032**: with 1771 m³/h and one filter OFFLINE, the bypass stays closed and the remaining 2 filters (plus one washing) take ~885 m³/h each, above the 590 m³/h maximum.
5. **Filter level at maximum flow**: at 590 m³/h per filter (3 in service + 1 washing at 1771 m³/h), dirty filters exceed H/HH and request backwash in cascade; the one-filter-out-at-a-time permissive queues them in step 4.
6. **Minimum refill flow**: with 410 m³/h inflow (103 m³/h per filter), step 9 takes longer than T09 = 540 s and the filter goes into HOLD ("T09 expired before reaching K09").
7. **Blower PSVs**: layout 26442-ST3-J2-16045-00001 sh.11 identifies the BL-30008/09 PSVs as PSV-160305644/645; the index uses PSV-160305618/622, numbers that match HV-160305618 (filter B BWO) and HV-160305622 (filter B AIRI). Probable duplicated loop number; confirm.
8. **Layout elevations**: instruments are at EL. 4041–4056 m (plant grade ≈ 4042 m, consistent with 0.608 bar(a) ≈ 4100 m). PI-160305605/606 and the blower PSVs are shown at EL. 3565 m, apparently a typo.
9. ~~**Regeneration pumps**: the layout confirms PU-30169/30170~~ → **refuted** by C&E rev002, which assigns PU-30169/30170 to acid dosing. The layout only shows them next to TK-30038 (by others), without stating their function. See contradiction 5.
10. **Two compressors running**: 2 × 350 Nm³/h exceed FAHH-160305602 (385) in 3 s and the C&E (E13) trips both. There is no permissive preventing a manual start of the standby unit while the duty unit is running.
11. **Bypass station (P&ID)**: FIT-160305603 is in the FV branch, between VBF-309704 and VBF-309708; VBF-309709 bypasses the whole station. With VBF-309709 open the bypass flow is neither measured nor controlled, and the FIC sees only the FV branch.
12. **Blower manual valves**: the valve list does not say which blower VCH-309710/309714 and VBF-309713/309717 belong to. They were assigned by the consecutive numbering of the train (VCH-309710, PI-160305605 with VBA-309711/712 and VBF-309713 for BL-30008; VCH-309714, PI-160305606 with VBA-309715/716 and VBF-309717 for BL-30009). TO BE CONFIRMED with the P&ID.
13. **Initial state of manual valves**: the valve list states "open" for all of them, including the drains and the VBF-309709 bypass. The simulator starts with the drains and VBF-309709 closed (normal operation).

## Check against the Training Manual (rev. 4)
Source: P-00260-PD-PCE-trainingmanual-C(EAST) pp. 57 (C&E matrix), 58 (SOE) and 87–88 (alarm list).

**Confirmed**
- Cause & effect matrix: the 15 causes and their effects (T/X) match the earlier reconstruction. Line, instrument, printed alarm and P&ID were added for each cause, plus tag and P&ID for each effect (`data/causa_efecto.json`).
- SOE (`data/soe.json`): the valve matrix of the 17 steps + HOLD is identical to the philosophy rev005 one (automated test). Common equipment: blowers ST only in step 7; backwash pumps ON in step 10; regeneration ON in steps 12–13; NaOCl ON in step 13; **HV-160305639 open only in step 8 (Dwell) and closed in steps 5–16 and in HOLD**, which confirms the implemented logic.
- Alarm list: setpoints, delays and activation conditions ("Always" / "Either compressor/blower running") match `data/alarmas.json`.

**New / errata in the original**
1. **LAH vs LAHH to request backwash**: C&E rows 10–13 describe "Level High-High" but print LAH-1603056xx (1613 mm). The philosophy uses LAHH (1763 mm). See parameter `lavado_por_LAH` (TO BE CONFIRMED).
2. **Compressors in the C&E**: effect 13 lists 16045-CM-30006/30005; the P&ID and the load list, CM-30011/30012.
3. **Caustic pumps**: the C&E identifies caustic dosing as 16045-PU-30210/30211 (effect 5).
4. **C&E rows 8 and 9**: both print FAL-160305607, for High-High and for Low-Low.
5. **Prefix 10645** instead of 16045 in several tags (AG-30006, AG-30007, FL-30035/36/37/38).
6. **SOE**: the air flow is shown as FIT-160305014 (it is FIT-160305607) and note 5 refers to the **WEST** plant philosophy.
7. **Digital alarm list**: repeats the AIRI/BWO swap (610↔614) for all 4 filters, and has misassigned alarms (line 24 ZAC-160305608 for ZSC-616; line 30 ZAC-611 for ZSC-619; lines 35–36 ZAO/ZAC-614 for HV-622; line 43 ZAO-611 for ZSO-627). The simulator uses ZAO/ZAC with each valve's own number.
8. **Filter LIT span**: the alarm list percentages (LAHH 63 % = 1763 mm, LAL 10 % = 280 mm, LALL 5 % = 140 mm) imply a span of ~2800 mm; the instrument index gives 0–2980 mm.
9. **TK-30016 pH (AIT-160305288)**: the alarm list defines AAHH/AAH/AAL/AALL "by Bechtel" with a 15 s delay; they were added with setpoints TO BE CONFIRMED. LIT-160305276 uses 3/5/5/3 s delays.

## v3 update (site review, 14-Oct)
- **Power supplies**: per `electrico.json` → `fallas_correctas`, panel 16045-PK-30005JB (and the 120 VAC UPS feeding it) only powers FIT-160305603; losing it leaves FIC-603 without PV (it holds its output). Loss of the client I/O panel 24 VDC is a separate fault: it de-energizes solenoids, leaves ZSO/ZSC at 0 and drives the filter LITs to 0 mA.
- **Balance during the fast rinse**: the SEVI of the rinsing filter draws from the same inlet header. The excess of filtered + RO/RW flow over the inflow comes from the water stored in the other filters, whose levels drop as they receive less flow. The Overview shows the balance with the accumulation term.
- **TT-160305703**: with the effective efficiency `comp_eta` (ASSUMPTION 0.92) the discharge stays at ≈ 84–132 °C between the site ambient extremes, in line with the datasheet (86–131 °C).
- **Quality per stream**: the documented quality is that of the blend. The RO permeate uses editable assumptions and the HDS water is obtained by difference, so that at the design flows the blend matches the documented values.

