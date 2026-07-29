// name: LIGHT COMMAND DOOR LIGHT
// nodeId: e8dd3419.8cde48
// flow: LIGHT_MAIN_DOOR
var result;
var ResultOn  = "TURN-LIGHTBAR-OVER-DOOR-ENTRY-ON";
var ResultOff = "TURN-LIGHTBAR-OVER-DOOR-ENTRY-OFF";

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