// name: LIGHT COMMAND KID 4
// nodeId: efebc5d2.62f878
// flow: LIGHT_KID_4
var result;
var ResultOn  = "TURN-LIGHT-KIDROOM4-ON";
var ResultOff = "TURN-LIGHT-KIDROOM4-OFF";

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