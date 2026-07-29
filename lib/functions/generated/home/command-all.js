// name: COMMAND ALL
// nodeId: 65acd935.85f9b8
// flow: HOME
var result;
var ResultOn  = "TURN-ALL-LIGHTS-ON";
var ResultOff = "TURN-ALL-LIGHTS-OFF";

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