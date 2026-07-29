// name: MAKE_EXCESSPOWER_TO_PAYLOAD
// nodeId: e93f57326a18d2d1
// flow: SOLAR_DASHBOARD
let ExcessPower = msg.payload?.ExcessPowerWatt;
let newmsg = {};
newmsg.payload = ExcessPower;
return newmsg;