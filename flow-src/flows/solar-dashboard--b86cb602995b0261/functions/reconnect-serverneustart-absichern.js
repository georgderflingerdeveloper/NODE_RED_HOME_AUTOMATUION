if (msg.topic === "modbus-reconnect") {
    return [{
        topic:"SolarEdgeModbusReconnectManual",
        payload:{
            connectorType:"TCP",
            tcpHost:"192.168.0.128",
            tcpPort:"502",
            tcpType:"DEFAULT",
            unitId:1,
            commandDelay:1,
            clientTimeout:1000,
            reconnectTimeout:2000
        }
    }, null];
}
if (msg.topic === "node-red-restart" && msg.payload === true) {
    return [null, msg];
}
return [null, null];