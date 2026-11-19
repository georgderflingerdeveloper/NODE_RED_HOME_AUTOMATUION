// name: eWeLink · Gerätestatus und Relais
// nodeId: sissi_ewelink_control
// flow: SISSIS ZIMMER · ZIGBEE
const devices = {
    bridge: env.get("SISSI_EWELINK_BRIDGE_ID"),
    button: env.get("SISSI_EWELINK_BUTTON_ID"),
    relay: env.get("SISSI_EWELINK_RELAY_ID"),
};
const appId = env.get("SISSI_EWELINK_APP_ID");
const token = env.get("SISSI_EWELINK_ACCESS_TOKEN");
const ids = Object.values(devices);
const configured = Boolean(appId && token && ids.every(Boolean) && new Set(ids).size === ids.length);
const now = Date.now();
const state = context.get("room") || { devices: {}, light: null, lastUpdate: null };
const baseUrl = "https://eu-apia.coolkit.cc/v2/device/thing";
const status = () => {
    context.set("room", state);
    return { payload: {
        configured,
        devices: state.devices,
        light: state.light,
        updated: state.lastUpdate,
        pending: Boolean(state.request && state.request.command),
        canSwitch: configured && !state.request && !(state.backoff > now) &&
            state.devices.bridge === "online" && state.devices.relay === "online" &&
            state.light !== null,
        message: state.message || "",
    } };
};
const sendRequest = (kind, command) => {
    state.request = { id: msg._msgid, kind, command, started: now };
    return [status(), {
        _msgid: msg._msgid,
        sissiRequest: { id: msg._msgid, kind },
        method: "POST",
        url: kind === "write" ? baseUrl + "/status" : baseUrl,
        requestTimeout: 8000,
        followRedirects: false,
        headers: {
            "Content-Type": "application/json",
            "X-CK-Appid": appId,
            Authorization: "Bearer " + token,
        },
        payload: kind === "write"
            ? { type: 1, id: devices.relay, params: { switch: command } }
            : { thingList: ids.map(id => ({ itemType: 1, id })) },
    }];
};
const clearStatus = message => {
    state.devices = {};
    state.light = null;
    state.message = message;
};

if (!configured) {
    clearStatus("eWeLink-Zugang und Gerätezuordnung fehlen.");
    return [status(), null];
}

if (msg.sissiRequest) {
    const request = state.request;
    if (!request || msg.sissiRequest.id !== request.id || msg.sissiRequest.kind !== request.kind) {
        return null;
    }
    delete state.request;
    const response = msg.payload;
    const code = Number(msg.statusCode);
    if (code !== 200 || response?.error !== 0) {
        const serviceCode = Number(response?.error);
        const throttled = code === 429 || serviceCode === 429;
        state.backoff = now + (throttled ? 300000 : 60000);
        clearStatus(throttled ? "eWeLink begrenzt Anfragen. Neuer Versuch in fünf Minuten."
            : "eWeLink konnte den Vorgang nicht bestätigen.");
        return [status(), null];
    }
    if (request.kind === "write") {
        return sendRequest("read", request.command);
    }
    if (!Array.isArray(response.data?.thingList)) {
        clearStatus("eWeLink hat keine verwertbare Geräteliste geliefert.");
        return [status(), null];
    }

    const byId = new Map(response.data.thingList.map(item => [item.itemData?.deviceid, item.itemData]));
    for (const [role, id] of Object.entries(devices)) {
        const online = byId.get(id)?.online;
        state.devices[role] = online === true ? "online" : online === false ? "offline" : "unknown";
    }
    const relay = byId.get(devices.relay);
    const relaySwitch = relay?.online === true ? relay.params?.switch : undefined;
    state.light = relaySwitch === "on" ? true : relaySwitch === "off" ? false : null;
    state.lastUpdate = now;
    state.message = request.command && relaySwitch !== request.command
        ? "Der angeforderte Zustand wurde vom Relais noch nicht bestätigt."
        : state.devices.bridge === "unknown" || state.devices.relay === "unknown"
            ? "Bridge oder Relais wurde im eWeLink-Konto nicht gefunden."
            : state.devices.bridge === "offline" || state.devices.relay === "offline"
                ? "Bridge oder Relais wird von eWeLink als offline gemeldet."
                : state.light === null ? "Das Relais meldet keinen unterstützten Schaltzustand." : "";
    return [status(), null];
}

if (state.request && now - state.request.started > 20000) {
    delete state.request;
    clearStatus("Zeitüberschreitung bei der eWeLink-Abfrage.");
}
if (state.request || state.backoff > now) {
    return [status(), null];
}
if (msg.topic === "sissi/poll") {
    return sendRequest("read");
}
if (msg.topic === "sissi/light" && typeof msg.payload === "boolean" &&
    state.devices.bridge === "online" && state.devices.relay === "online" &&
    state.light !== null && state.lastUpdate > now - 120000) {
    return msg.payload === state.light ? [status(), null] : sendRequest("write", msg.payload ? "on" : "off");
}
return [status(), null];
