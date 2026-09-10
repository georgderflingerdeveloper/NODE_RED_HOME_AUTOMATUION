if (msg.topic === "history/dashboard") return [msg, null];
if (msg.topic === "energy/forecast/read") return [null, msg];
node.warn(`Unbekannte Dashboard-Abfrage ignoriert: ${msg.topic || "ohne Topic"}`);
return [null, null];
