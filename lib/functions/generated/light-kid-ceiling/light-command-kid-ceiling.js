// name: LIGHT COMMAND KID CEILING
// nodeId: c3771cc1.4c77d
// flow: LIGHT_KID_CEILING
var result;
var ResultOn  = "TURN-LIGHT-KIDROOM1-ON";
var ResultOff = "TURN-LIGHT-KIDROOM1-OFF";

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