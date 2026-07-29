// name: LIGHT COMMAND ANTEROOM MIDDLE
// nodeId: 4480e402.3d37fc
// flow: SUB_LIGHT_ANTEROOM_MIDDLE
var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-MIDDLE-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-MIDDLE-OFF";

if( msg.payload === true)
{
   result = ResultOn;
}
else
{
   result = ResultOff;
}
msg.payload = result;
return msg;