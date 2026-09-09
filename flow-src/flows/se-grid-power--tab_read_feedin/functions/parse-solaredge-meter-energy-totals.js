// SolarEdge/SunSpec meter model (base-0):
// 226..227 M_Exported, 234..235 M_Imported, 242 M_Energy_W_SF.
const registers = Array.isArray(msg.payload) ? msg.payload : msg.payload?.data;
if (!registers || registers.length < 17) {
    node.status({fill:"red", shape:"ring", text:"Energiezähler: 17 Register erwartet"});
    return null;
}

const toInt16 = value => (value & 0x8000) ? value - 0x10000 : value;
const toUint32 = (highWord, lowWord) => ((highWord & 0xffff) * 0x10000) + (lowWord & 0xffff);
const exportedRawWh = toUint32(registers[0], registers[1]);
const importedRawWh = toUint32(registers[8], registers[9]);
const scaleFactor = toInt16(registers[16]);

if (
    exportedRawWh === 0xffffffff ||
    importedRawWh === 0xffffffff ||
    scaleFactor === -32768 ||
    scaleFactor < -6 ||
    scaleFactor > 3
) {
    node.status({fill:"red", shape:"ring", text:"Energiezähler: ungültige SunSpec-Werte"});
    return null;
}

const wattHourFactor = Math.pow(10, scaleFactor);
const gridExportTotalKWh = exportedRawWh * wattHourFactor / 1000;
const gridImportTotalKWh = importedRawWh * wattHourFactor / 1000;
const previousImport = Number(global.get("SolarEdgeGridImportTotalKWh"));
const previousExport = Number(global.get("SolarEdgeGridExportTotalKWh"));
if (
    Number.isFinite(previousImport) && gridImportTotalKWh + 0.001 < previousImport ||
    Number.isFinite(previousExport) && gridExportTotalKWh + 0.001 < previousExport
) {
    node.status({fill:"red", shape:"ring", text:"Energiezähler: Rücksprung erkannt"});
    return null;
}

const observedAt = new Date().toISOString();
const payload = {
    schemaVersion: 1,
    source: "SolarEdgeSunSpecMeter",
    observedAt,
    gridImportTotalKWh,
    gridExportTotalKWh,
    scaleFactor,
    registers: {
        baseZeroStart: 226,
        quantity: 17,
        importedRawWh,
        exportedRawWh
    }
};

global.set("SolarEdgeGridImportTotalKWh", gridImportTotalKWh);
global.set("SolarEdgeGridExportTotalKWh", gridExportTotalKWh);
global.set("SolarEdgeMeterEnergyLastSuccessMs", Date.now());
node.status({
    fill:"green",
    shape:"dot",
    text:"Zähler: Bezug " + gridImportTotalKWh.toFixed(3) + " · Einspeisung " + gridExportTotalKWh.toFixed(3) + " kWh"
});
msg.topic = "history/source/solaredge-meter-totals";
msg.source = "SolarEdgeSunSpecMeter";
msg.payload = payload;
return msg;
