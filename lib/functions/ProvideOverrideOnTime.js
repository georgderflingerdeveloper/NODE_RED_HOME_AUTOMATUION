// name: ProvideOverrideOnTime
// outputs: 1
var OnOverride = "On_Override ";
msg.payload = OnOverride + msg.payload.HourOn + ":" + msg.payload.MinuteOn;
return msg;