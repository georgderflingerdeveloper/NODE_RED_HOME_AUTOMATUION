// name: LIGHT COMMAND KID 3
// nodeId: 62ec3391.b3b57c
// flow: LIGHT_KID_3
var result;
var ResultOn  = "TURN-LIGHT-KIDROOM3-ON";
var ResultOff = "TURN-LIGHT-KIDROOM3-OFF";

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