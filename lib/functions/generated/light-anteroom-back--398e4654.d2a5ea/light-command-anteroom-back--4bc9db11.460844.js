// name: LIGHT COMMAND ANTEROOM BACK
// nodeId: 4bc9db11.460844
// flow: LIGHT_ANTEROOM_BACK
var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-BACK-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-BACK-OFF";

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