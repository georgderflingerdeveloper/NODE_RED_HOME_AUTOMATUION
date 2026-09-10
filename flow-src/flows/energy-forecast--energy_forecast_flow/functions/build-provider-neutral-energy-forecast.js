const nowMs = Number.isFinite(Number(msg.now)) ? Number(msg.now) : Date.now();
const input = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
const providerName = String(input.provider || input.ProviderName || input.source || "unknown");
const previous = global.get("EnergyForecastData") || {};

const slots = (Array.isArray(input.slots) ? input.slots : [])
    .map((slot) => {
        const validFromMs = new Date(slot.validFrom ?? slot.ValidFrom).getTime();
        const validUntilMs = new Date(slot.validUntil ?? slot.ValidUntil).getTime();
        const priceCtPerKWh = Number(slot.priceCtPerKWh ?? slot.PriceCtPerKWh);
        if (!Number.isFinite(validFromMs) || !Number.isFinite(validUntilMs) || !Number.isFinite(priceCtPerKWh)) return null;
        return {
            ValidFrom: new Date(validFromMs).toISOString(),
            ValidUntil: new Date(validUntilMs).toISOString(),
            PriceCtPerKWh: priceCtPerKWh
        };
    })
    .filter(Boolean)
    .sort((left, right) => left.ValidFrom.localeCompare(right.ValidFrom));

const currentSlot = slots.find((slot) =>
    new Date(slot.ValidFrom).getTime() <= nowMs && nowMs < new Date(slot.ValidUntil).getTime()
);
const prices = slots.map((slot) => slot.PriceCtPerKWh).sort((left, right) => left - right);
const quantile = (fraction) => prices[Math.floor((prices.length - 1) * fraction)];
const cheapThreshold = prices.length ? quantile(1 / 3) : null;
const expensiveThreshold = prices.length ? quantile(2 / 3) : null;
const providerOnline = input.ProviderOnline !== false && input.online !== false && Boolean(currentSlot);
const currentPrice = currentSlot?.PriceCtPerKWh ?? null;
const estimatedCostCheap = providerOnline && cheapThreshold !== expensiveThreshold && currentPrice <= cheapThreshold;
const estimatedCostExpensive = providerOnline && cheapThreshold !== expensiveThreshold && currentPrice >= expensiveThreshold;
const notAvailable = !providerOnline || currentPrice === null;
const classification = notAvailable
    ? "not-available"
    : estimatedCostCheap
        ? "cheap"
        : estimatedCostExpensive
            ? "expensive"
            : "normal";

const classifySlot = (slot) => ({
    ...slot,
    Classification: cheapThreshold !== expensiveThreshold && slot.PriceCtPerKWh <= cheapThreshold
        ? "cheap"
        : cheapThreshold !== expensiveThreshold && slot.PriceCtPerKWh >= expensiveThreshold
            ? "expensive"
            : "normal"
});
const classifiedSlots = slots.map(classifySlot);
const byPrice = [...classifiedSlots].sort((left, right) => left.PriceCtPerKWh - right.PriceCtPerKWh);

const forecast = {
    SchemaVersion: 1,
    UpdatedAt: new Date(nowMs).toISOString(),
    ProviderOnline: providerOnline,
    EstimatedCostExpensive: estimatedCostExpensive,
    EstimatedCostCheap: estimatedCostCheap,
    NotAvailable: notAvailable,
    Classification: classification,
    Provider: {
        Name: providerName,
        Online: providerOnline,
        LastUpdate: input.fetchedAt || input.UpdatedAt || new Date(nowMs).toISOString(),
        ValidUntil: currentSlot?.ValidUntil ?? null
    },
    Current: currentSlot ? {
        PriceCtPerKWh: currentPrice,
        ValidFrom: currentSlot.ValidFrom,
        ValidUntil: currentSlot.ValidUntil
    } : null,
    Thresholds: {
        Method: "provider-window-tertiles",
        CheapCtPerKWh: cheapThreshold,
        ExpensiveCtPerKWh: expensiveThreshold
    },
    Forecast: {
        HorizonStart: classifiedSlots[0]?.ValidFrom ?? null,
        HorizonEnd: classifiedSlots.at(-1)?.ValidUntil ?? null,
        Slots: classifiedSlots,
        CheapestSlots: byPrice.slice(0, 3),
        MostExpensiveSlots: byPrice.slice(-3).reverse()
    },
    Extensions: previous.Extensions || {
        AI: { Enabled: false, Status: "not-configured", Prediction: null }
    }
};

global.set("EnergyForecastData", forecast);
node.status({
    fill: notAvailable ? "red" : estimatedCostCheap ? "green" : estimatedCostExpensive ? "red" : "yellow",
    shape: notAvailable ? "ring" : "dot",
    text: notAvailable ? "Prognose nicht verfügbar" : `${classification}: ${currentPrice.toFixed(3)} ct/kWh`
});
msg.topic = "energy/forecast/result";
msg.payload = forecast;
return msg;
