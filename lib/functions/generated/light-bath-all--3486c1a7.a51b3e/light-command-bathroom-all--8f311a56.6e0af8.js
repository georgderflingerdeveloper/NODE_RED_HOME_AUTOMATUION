// name: LIGHT COMMAND BATHROOM ALL
// nodeId: 8f311a56.6e0af8
// flow: LIGHT_BATH_ALL
var result;
var ResultOn  = "TURN-LIGHT-BATHROOM-ALL-ON";
var ResultOff = "TURN-LIGHT-BATHROOM-ALL-OFF";

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