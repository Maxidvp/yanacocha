# Open items – AWTP EAST (rev. 4, after P&ID, PFD, layout and C&E verification)

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
10. **Altitude**: 3600 m vs 4100 m.

## Information still missing from the documents
- Logic of the compressor drain valve HV-160305646 (not in the philosophy).
- Minimum/maximum flow and logic of the backwash pump (by others; simulated as an ideal pump).
- Dimensions/levels of the sumps (filtered water, backwash waste, regeneration) – by others; simulated as boundaries.
- Setpoint K12 (regeneration sump level to recirculate).
- ~~The cause & effect matrix was rebuilt from text~~ → **verified** against the original (see below).
- Calibration range of the filter LITs: the alarm list refers to 26443-220-V1A-MLF0-00196 (EAST Radar Level Indicating Transmitter). That document should settle the K06/K09 reference (finding 1).
- Stroke time of the on/off valves (adjusted with the exhaust silencer; 10–30 s suggested as an editable parameter).

## Simulator findings (rev. 3)
Found by running the process model and the logic together. Each one is an editable parameter in *Scenarios and faults*.
1. **K06 / K09 reference**: K06 = 1825 mm and K09 = 3000 mm cannot be on the LIT scale (0–2980 mm; service 1100–1500, HH 1763): drain-down would end immediately and refill would never end (3000 > 2980). They are read as **referenced to the filter floor**, with the LIT zero 1400 mm above the floor (assumption `z0_LIT_mm`). So K06 → LIT 425 mm (≈ "300–500 mm above the media") and K09 → LIT 1600 mm (top of the normal range). TO BE CONFIRMED with Aquatech.
2. **Valve stroke vs discrepancy delay**: the alarm list sets ZAO/ZAC at 15 s and the valve list suggests 10–30 s strokes. With a stroke ≥ 15 s every operation raises ZAO/ZAC and the filter goes into device HOLD. 12 s is used by default. The real stroke must stay below the delay, or the delay must be raised.
3. **Bypass threshold vs scenario table**: the text says "inflow < 2032 m³/h → FV at 0 %", but the table includes 1219 m³/h inflow with 853 m³/h bypass (2 filters out + 1 washing). With the literal text, those scenarios overflow TK-30015. See parameter `bypass_auto_si_sp`.
4. **Capacity with 1 filter out and inflow < 2032**: with 1771 m³/h and one filter OFFLINE, the bypass stays closed and the remaining 2 filters (plus one washing) take ~885 m³/h each, above the 590 m³/h maximum.
5. **Filter level at maximum flow**: at 590 m³/h per filter (3 in service + 1 washing at 1771 m³/h), dirty filters exceed H/HH and request backwash in cascade; the one-filter-out-at-a-time permissive queues them in step 4.
6. **Minimum refill flow**: with 410 m³/h inflow (103 m³/h per filter), step 9 takes longer than T09 = 540 s and the filter goes into HOLD ("T09 expired before reaching K09").
7. **Blower PSVs**: layout 26442-ST3-J2-16045-00001 sh.11 identifies the BL-30008/09 PSVs as PSV-160305644/645; the index uses PSV-160305618/622, numbers that match HV-160305618 (filter B BWO) and HV-160305622 (filter B AIRI). Probable duplicated loop number; confirm.
8. **Layout elevations**: instruments are at EL. 4041–4056 m (plant grade ≈ 4042 m, consistent with 0.608 bar(a) ≈ 4100 m). PI-160305605/606 and the blower PSVs are shown at EL. 3565 m, apparently a typo.
9. ~~**Regeneration pumps**: the layout confirms PU-30169/30170~~ → **refuted** by C&E rev002, which assigns PU-30169/30170 to acid dosing. The layout only shows them next to TK-30038 (by others), without stating their function. See contradiction 5.
10. **Two compressors running**: 2 × 350 Nm³/h exceed FAHH-160305602 (385) in 3 s and the C&E (E13) trips both. There is no permissive preventing a manual start of the standby unit while the duty unit is running.

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
