// name: LIGHT COMMAND ANTEROOM MAIN
// nodeId: 56b8eb53.8f1a84
// flow: SUB_ANTEROOM_MAIN_LIGHT
var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-MAIN-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-MAIN-OFF";

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