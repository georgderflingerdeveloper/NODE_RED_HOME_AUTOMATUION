// SolarEdge inverter SunSpec model, Modbus protocol address base 0:
// 40093..40094 I_AC_Energy_WH, 40095 I_AC_Energy_WH_SF.
const registers = Array.isArray(msg.payload) ? msg.payload : msg.payload?.data;
if (!registers || registers.length < 3) {
    node.status({fill:"red", shape:"ring", text:"PV-Zähler: 3 Register erwartet"});
    return null;
}

const toInt16 = value => (value & 0x8000) ? value - 0x10000 : value;
const toUint32 = (highWord, lowWord) => ((highWord & 0xffff) * 0x10000) + (lowWord & 0xffff);
const producedRawWh = toUint32(registers[0], registers[1]);
const scaleFactor = toInt16(registers[2]);
if (producedRawWh === 0xffffffff || scaleFactor === -32768 || scaleFactor < -6 || scaleFactor > 3) {
    node.status({fill:"red", shape:"ring", text:"PV-Zähler: ungültige SunSpec-Werte"});
    return null;
}

const pvProductionTotalKWh = producedRawWh * Math.pow(10, scaleFactor) / 1000;
const previous = Number(global.get("SolarEdgePvProductionTotalKWh"));
if (Number.isFinite(previous) && pvProductionTotalKWh + 0.001 < previous) {
    node.status({fill:"red", shape:"ring", text:"PV-Zähler: Rücksprung erkannt"});
    return null;
}

const observedAt = new Date().toISOString();
global.set("SolarEdgePvProductionTotalKWh", pvProductionTotalKWh);
global.set("SolarEdgeInverterEnergyLastSuccessMs", Date.now());
node.status({fill:"green", shape:"dot", text:"PV gesamt: " + pvProductionTotalKWh.toFixed(3) + " kWh"});
msg.topic = "history/source/solaredge-inverter-total";
msg.source = "SolarEdgeSunSpecInverter";
msg.payload = {
    schemaVersion: 1,
    source: "SolarEdgeSunSpecInverter",
    observedAt,
    pvProductionTotalKWh,
    scaleFactor,
    registers: {baseZeroStart: 40093, quantity: 3, producedRawWh}
};
return msg;
