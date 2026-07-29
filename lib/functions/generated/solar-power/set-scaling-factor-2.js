// name: SET_SCALING_FACTOR
// nodeId: fff48bd538f411b2
// flow: SOLAR_POWER
let ScalingFactorRaw = msg.payload | 0;

let ScalingFactor = (ScalingFactorRaw << 16) >> 16;


global.set("SCALING_FACTOR", ScalingFactor || 0);
return msg;