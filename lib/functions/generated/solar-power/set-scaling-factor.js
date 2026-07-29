// name: SET_SCALING_FACTOR
// nodeId: a76994740dc9a8d9
// flow: SOLAR_POWER
global.set("SCALING_FACTOR", msg.payload || 0);
return msg;