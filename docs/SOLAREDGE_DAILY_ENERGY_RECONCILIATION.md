# SolarEdge daily energy reconciliation

## Purpose

The fast SolarEdge flow integrates instantaneous power into hourly energy values. Short network outages therefore leave visible gaps. The SolarEdge meter also exposes monotonically increasing import and export energy counters. Their daily deltas provide an independent anchor for detecting and quantifying those gaps.

Raw hourly history is never overwritten. Reconciliation stores the measured counter delta, the integrated value, and the difference separately. Automations can use the positive fallback fields while diagnostics retain the original values.

## SunSpec register map

The flow reads 17 holding registers starting at base-0 address `226` on the existing SolarEdge Modbus unit `1`:

| Registers (base 0) | Field | Encoding |
|---|---|---|
| 226–227 | `M_Exported` | unsigned 32-bit Wh accumulator |
| 234–235 | `M_Imported` | unsigned 32-bit Wh accumulator |
| 242 | `M_Energy_W_SF` | signed 16-bit common scale factor |

This mapping follows SolarEdge's *SunSpec Logging Technical Note*, version 3.2 (June 2025). The parser rejects SunSpec not-implemented values, implausible scale factors, incomplete responses, and counter rollbacks.

## Data path

1. `READ: Meter export/import totals (+SF)` polls the meter every 30 seconds and resumes automatically after Modbus reconnect.
2. `parse-solaredge-meter-energy-totals.js` decodes and validates both cumulative counters.
3. `home-automation-history.js` stores every valid sample in `solaredge_meter_readings`.
4. `reconcile-solaredge-daily-energy.cjs` calculates the current daily comparison and stores it in `daily_energy_reconciliation`.
5. The cost dashboard refreshes when a new counter result arrives and shows the newest daily anchor.

## Meaning of the result

- `meterImportKWh` / `meterExportKWh`: counter deltas from SolarEdge.
- `integratedImportKWh` / `integratedExportKWh`: existing power integration.
- `importDifferenceKWh` / `exportDifferenceKWh`: signed deviation.
- `fallbackImportKWh` / `fallbackExportKWh`: only the positive missing quantity; safe for fallback use.
- `importComparisonCostEur`: integrated import cost plus the missing import quantity valued at the day's weighted market price.
- `exportComparisonValueEur`: exported meter energy valued at the same market price. This is a comparison value, not the contractual feed-in payment.

`quality=partial-day` means no reading from before the local day boundary exists yet. `quality=estimated-boundary` marks an older baseline that is not close enough to midnight. After continuous operation across midnight, the next day is `quality=anchored`.

## Live commissioning checklist

1. Connect to the SolarEdge network and wait up to 30 seconds.
2. Verify that both cumulative totals are plausible and never decrease.
3. Compare register direction with a known import/export operating state.
4. Check the cost dashboard for a current SolarEdge daily anchor.
5. Run `npm test`, `npm run flow:check`, and `npm run database:check` after commissioning.
