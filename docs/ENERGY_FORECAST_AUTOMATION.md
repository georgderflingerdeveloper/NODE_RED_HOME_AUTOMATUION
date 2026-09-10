# Provider-neutral energy forecast automation

## Purpose

The `ENERGY_FORECAST` flow separates provider data, automation decisions and
dashboard presentation. Its stable contract is the global context object
`EnergyForecastData`. Automations and a future AI layer consume this object
instead of reading a provider-specific payload.

## Stable global contract

The four primary Boolean properties are mutually exclusive where applicable:

- `ProviderOnline`: the provider supplied a currently valid price slot;
- `EstimatedCostCheap`: current price is in the lower third of the supplied window;
- `EstimatedCostExpensive`: current price is in the upper third;
- `NotAvailable`: no currently valid provider result exists.

Additional sections contain `Provider`, `Current`, `Thresholds`, `Forecast` and
`Extensions`. `Forecast.Slots` uses only `ValidFrom`, `ValidUntil`,
`PriceCtPerKWh` and `Classification`, independent of the upstream provider.

## Inputs and outputs

Provider adapters send a normalized message to `NORMALIZED PROVIDER DATA IN`:

```js
msg.payload = {
  provider: "Provider name",
  online: true,
  fetchedAt: new Date().toISOString(),
  slots: [{ validFrom, validUntil, priceCtPerKWh }]
};
```

To read the current state from another flow, send
`msg.topic = "energy/forecast/read"` to `FORECAST READ REQUEST IN`. The Function
`Read energy forecast data` returns `msg.topic = "energy/forecast/result"` and
the complete structure in `msg.payload`.

## Future AI layer

An AI component may add its result below `EnergyForecastData.Extensions.AI`.
Provider normalization and dashboard consumers must keep working when the AI is
disabled, offline or replaced. Rule-based `cheap`, `normal`, `expensive` and
`not-available` states remain the deterministic fallback.
