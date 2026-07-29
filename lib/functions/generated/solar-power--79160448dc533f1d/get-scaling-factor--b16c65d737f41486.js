// name: GET_SCALING_FACTOR
// nodeId: b16c65d737f41486
// flow: SOLAR_POWER
let ScalingFactor = global.get("SCALING_FACTOR") || 0;
msg.payload = ScalingFactor;
return msg;