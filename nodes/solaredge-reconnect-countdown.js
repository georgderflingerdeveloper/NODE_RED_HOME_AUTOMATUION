// Der Modbus-Client verbindet beim Start und nach einem Transportfehler selbst.
module.exports = function (RED) {
    function SolarEdgeConnection(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const shared = node.context().global;
        const client = RED.nodes.getNode(config.server);
        const offlineStates = new Set(["broken", "closed", "failed", "stopped", "reconnecting"]);

        function updateTransport() {
            const state = client?.actualServiceState?.value;
            const connected = client?.messageAllowedStates?.includes(state) || state === "opened";
            let transport = "connecting";
            if (connected) transport = "connected";
            else if (offlineStates.has(state)) transport = "disconnected";
            shared.set("SolarEdgeTransportState", transport);

            const retryDue = state === "reconnecting" ? Date.now() + client.reconnectDelay : 0;
            shared.set("SolarEdgeTransportRetryDueMs", retryDue);
        }

        const events = ["mbinit", "mbconnected", "mbopen", "mbswitch", "mbclosed", "mbbroken", "mbreconnecting"];
        for (const event of events) client?.on(event, updateTransport);
        updateTransport();
        node.on("input", function (msg, send, done) {
            if (msg.topic === "node-red-restart" && msg.payload === true) {
                send([msg, null]);
            } else if (msg.topic === "modbus-reconnect" && msg.payload === true &&
                offlineStates.has(client?.actualServiceState?.value)) {
                send([msg, {payload:"Manueller Neuaufbau angefordert."}]);
            }
            done();
        });
        node.on("close", function () {
            for (const event of events) client?.removeListener(event, updateTransport);
        });
    }
    RED.nodes.registerType("solaredge-reconnect-countdown", SolarEdgeConnection);
};
