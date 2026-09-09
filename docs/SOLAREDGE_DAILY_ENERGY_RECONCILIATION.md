# SolarEdge daily energy reconciliation

## Purpose

The fast SolarEdge flow integrates instantaneous power into hourly energy values. Short network outages therefore leave visible gaps. The SolarEdge meter exposes monotonically increasing import and export counters, while the inverter exposes its cumulative AC production counter. Their daily deltas provide an independent anchor for production, consumption, import, and export.

Raw hourly history is never overwritten. Reconciliation stores the measured counter delta, the integrated value, and the difference separately. Automations can use the positive fallback fields while diagnostics retain the original values.

## SunSpec register map

The flow reads 17 holding registers starting at base-0 address `226` on the existing SolarEdge Modbus unit `1`:

| Registers (base 0) | Field | Encoding |
|---|---|---|
| 226–227 | `M_Exported` | unsigned 32-bit Wh accumulator |
| 234–235 | `M_Imported` | unsigned 32-bit Wh accumulator |
| 242 | `M_Energy_W_SF` | signed 16-bit common scale factor |

The inverter flow additionally reads three holding registers:

| Registers (base 0) | Field | Encoding |
|---|---|---|
| 40093–40094 | `I_AC_Energy_WH` | unsigned 32-bit Wh accumulator |
| 40095 | `I_AC_Energy_WH_SF` | signed 16-bit scale factor |

This mapping follows SolarEdge's *SunSpec Logging Technical Note*, version 3.2 (June 2025). The parser rejects SunSpec not-implemented values, implausible scale factors, incomplete responses, and counter rollbacks.

## Data path

1. `READ: Meter export/import totals (+SF)` polls the meter every 30 seconds and resumes automatically after Modbus reconnect.
2. `READ: Inverter PV energy total (+SF)` polls cumulative AC production every 30 seconds.
3. The exactly matching parser files decode and validate the meter and inverter counters.
4. `home-automation-history.js` stores raw values separately in `solaredge_meter_readings` and `solaredge_inverter_readings`.
5. `reconcile-solaredge-daily-energy.cjs` calculates the current daily comparison and stores grid reconciliation and the complete energy balance separately.
6. The cost dashboard refreshes when either counter result arrives and shows the newest daily anchor.

## Meaning of the result

- `meterImportKWh` / `meterExportKWh`: counter deltas from SolarEdge.
- `meterPvProductionKWh`: inverter production-counter delta.
- `meterHouseConsumptionKWh`: balance `production + import - export` (for systems without battery correction).
- `integratedPvProductionKWh` / `integratedHouseConsumptionKWh`: existing power integration.
- `fallbackPvProductionKWh` / `fallbackHouseConsumptionKWh`: positive gaps between counter balance and local integration.
- `integratedImportKWh` / `integratedExportKWh`: existing power integration.
- `importDifferenceKWh` / `exportDifferenceKWh`: signed deviation.
- `fallbackImportKWh` / `fallbackExportKWh`: only the positive missing quantity; safe for fallback use.
- `importComparisonCostEur`: integrated import cost plus the missing import quantity valued at the day's weighted market price.
- `exportComparisonValueEur`: exported meter energy valued at the same market price. This is a comparison value, not the contractual feed-in payment.

`quality=partial-day` means no reading from before the local day boundary exists yet; values from unlike time windows are deliberately not compared. `quality=grid-only` means only the import/export boundary is available. `quality=estimated-boundary` marks older baselines that are not close enough to midnight. After continuous operation across midnight, the next complete day is `quality=anchored`.

## Live commissioning checklist

1. Connect to the SolarEdge network and wait up to 30 seconds.
2. Verify that all three cumulative totals are plausible and never decrease.
3. Compare register direction with a known import/export operating state.
4. Compare the first complete day with SolarEdge production and consumption totals.
5. Check the cost dashboard for a current SolarEdge daily anchor.
6. Run `npm test`, `npm run flow:check`, and `npm run database:check` after commissioning.
