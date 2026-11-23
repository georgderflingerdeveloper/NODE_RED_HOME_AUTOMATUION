const DELAY_MS = 10000;
const MIN_SPACING_MS = 15000;

module.exports = function (RED) {
    function SolarEdgeCountdown(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const shared = node.context().global;
        let due = 0;
        let timer;

        function clearCountdown() {
            clearInterval(timer);
            timer = undefined;
            due = 0;
            shared.set("SolarEdgeReconnectDueMs", 0);
        }

        function tick() {
            const remaining = Math.ceil((due - Date.now()) / 1000);
            if (remaining > 0) {
                node.status({fill:"yellow", shape:"ring", text:remaining + " s"});
                node.send([null, {payload:"Verbindung wird in " + remaining + " s neu aufgebaut."}]);
                return;
            }
            clearCountdown();
            shared.set("SolarEdgeLastReconnectMs", Date.now());
            node.status({fill:"blue", shape:"dot", text:"Reconnect angefordert"});
            node.send([{topic:"modbus-reconnect", payload:true},
                {payload:"Neuaufbau der Modbus-Verbindung angefordert."}]);
        }

        function schedule() {
            if (due) return;
            const last = Number(shared.get("SolarEdgeLastReconnectMs")) || 0;
            due = Math.max(Date.now() + DELAY_MS, last + MIN_SPACING_MS);
            shared.set("SolarEdgeReconnectDueMs", due);
            tick();
            timer = setInterval(tick, 1000);
        }

        RED.events.on("flows:started", schedule);
        node.on("input", function (msg, send, done) {
            if (msg.payload === "connect") {
                schedule();
            } else if (msg.topic === "modbus-reconnect") {
                clearCountdown();
                shared.set("SolarEdgeLastReconnectMs", Date.now());
                send([msg, {payload:"Manueller Neuaufbau angefordert."}]);
            } else if (msg.topic === "node-red-restart") {
                send([msg, null]);
            }
            done();
        });
        node.on("close", function () {
            RED.events.removeListener("flows:started", schedule);
            clearCountdown();
        });
    }
    RED.nodes.registerType("solaredge-reconnect-countdown", SolarEdgeCountdown);
};
