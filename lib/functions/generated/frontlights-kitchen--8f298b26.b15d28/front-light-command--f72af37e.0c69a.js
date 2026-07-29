// name: FRONT LIGHT COMMAND
// nodeId: f72af37e.0c69a
// flow: FRONTLIGHTS_KITCHEN
var result;
var ResultOn  = "TURN-FRONT-LIGHTS-ON";
var ResultOff = "TURN-FRONT-LIGHTS-OFF";

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