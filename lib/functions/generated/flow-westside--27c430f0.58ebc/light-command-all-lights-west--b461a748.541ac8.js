// name: LIGHT COMMAND ALL LIGHTS WEST
// nodeId: b461a748.541ac8
// flow: FLOW_WESTSIDE
var result;
var ResultOn  = "TURN-ALL-LIGHTS-WEST-ON";
var ResultOff = "TURN-ALL-LIGHTS-WEST-OFF";

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