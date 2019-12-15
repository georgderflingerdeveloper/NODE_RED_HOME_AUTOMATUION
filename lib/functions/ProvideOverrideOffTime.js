// name: ProvideOverrideOffTime
// outputs: 1
var OffOverride = "Off_Override ";
msg.payload = OffOverride + msg.payload.HourOff + ":" + msg.payload.MinuteOff;
return msg;