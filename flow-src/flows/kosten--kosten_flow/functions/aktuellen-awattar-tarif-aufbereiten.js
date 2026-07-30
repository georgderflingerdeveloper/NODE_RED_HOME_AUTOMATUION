const priceSlots = Array.isArray(msg.payload?.data) ? msg.payload.data : [];
const now = Date.now();
const currentSlot = priceSlots.find((slot) =>
    Number(slot.start_timestamp) <= now && now < Number(slot.end_timestamp)
);

if (!currentSlot || !Number.isFinite(Number(currentSlot.marketprice))) {
    node.status({ fill: "red", shape: "ring", text: "kein aktueller Tarif" });
    node.error("aWATTar lieferte keinen gültigen aktuellen Marktpreis", msg);
    return null;
}

// aWATTar liefert Eur/MWh. Für Cent/kWh wird durch 10 geteilt.
const priceCtPerKWh = Number(currentSlot.marketprice) / 10;
const tariff = {
    provider: "aWATTar",
    tariffType: "Börsenpreis (ohne Netzentgelte, Abgaben und individuelle Aufschläge)",
    priceCtPerKWh,
    priceEurPerKWh: priceCtPerKWh / 100,
    marketPriceEurPerMWh: Number(currentSlot.marketprice),
    validFrom: new Date(Number(currentSlot.start_timestamp)).toISOString(),
    validUntil: new Date(Number(currentSlot.end_timestamp)).toISOString(),
    fetchedAt: new Date(now).toISOString()
};

tariff.slots = priceSlots
    .filter((slot) =>
        Number.isFinite(Number(slot.start_timestamp)) &&
        Number.isFinite(Number(slot.end_timestamp)) &&
        Number.isFinite(Number(slot.marketprice))
    )
    .map((slot) => ({
        validFrom: new Date(Number(slot.start_timestamp)).toISOString(),
        validUntil: new Date(Number(slot.end_timestamp)).toISOString(),
        marketPriceEurPerMWh: Number(slot.marketprice),
        priceCtPerKWh: Number(slot.marketprice) / 10
    }));

const viennaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit"
});
const viennaTime = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit"
});
const viennaDayLabel = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", weekday: "short", day: "2-digit", month: "2-digit"
});
const todayKey = viennaDate.format(new Date(now));
const [year, month] = todayKey.split("-").map(Number);
const daysInMonth = new Date(year, month, 0).getDate();
const hourlyPricesByDay = new Map();

for (const slot of priceSlots) {
    const start = new Date(Number(slot.start_timestamp));
    const dayKey = viennaDate.format(start);
    const hours = hourlyPricesByDay.get(dayKey) || [];
    hours.push({
        time: viennaTime.format(start),
        marketPriceCtPerKWh: Number(slot.marketprice) / 10,
        hourlyCostEur: null
    });
    hourlyPricesByDay.set(dayKey, hours);
}

const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
    const date = new Date(Date.UTC(year, month - 1, index + 1, 12));
    return {
        dayKey,
        label: viennaDayLabel.format(date),
        isToday: dayKey === todayKey,
        dailyConsumptionKWh: null,
        dailyCostEur: null,
        hours: hourlyPricesByDay.get(dayKey) || []
    };
});

tariff.dashboard = {
    monthLabel: new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", month: "long", year: "numeric" }).format(new Date(now)),
    days,
    dataStatus: "Vorlage – Verbrauchsdaten werden im nächsten Schritt ergänzt"
};

flow.set("aWATTarCurrentTariff", tariff);
global.set("aWATTarCurrentTariff", tariff);
node.status({ fill: "green", shape: "dot", text: priceCtPerKWh.toFixed(3) + " ct/kWh" });

msg.topic = "aWATTar/tariff/current";
msg.payload = tariff;
return msg;
