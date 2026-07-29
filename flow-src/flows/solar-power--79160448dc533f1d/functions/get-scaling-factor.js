let ScalingFactor = global.get("SCALING_FACTOR") || 0;
msg.payload = ScalingFactor;
return msg;