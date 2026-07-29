let ScalingFactorRaw = msg.payload | 0;

let ScalingFactor = (ScalingFactorRaw << 16) >> 16;


global.set("SCALING_FACTOR", ScalingFactor || 0);
return msg;