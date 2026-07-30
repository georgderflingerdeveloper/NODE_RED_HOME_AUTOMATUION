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

flow.set("aWATTarCurrentTariff", tariff);
global.set("aWATTarCurrentTariff", tariff);
node.status({ fill: "green", shape: "dot", text: priceCtPerKWh.toFixed(3) + " ct/kWh" });

msg.topic = "aWATTar/tariff/current";
msg.payload = tariff;
return msg;