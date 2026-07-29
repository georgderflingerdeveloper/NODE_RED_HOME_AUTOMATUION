// name: LIGHT COMMAND INDOW BESIDE DOOR LIGHT
// nodeId: 457726bc.ce31c8
// flow: LIGHT_RIGHT_NEXT_DOOR
var result;
var ResultOn  = "TURN-LIGHTBAR-OVER-RIGHTWINDOW-BESIDE-DOOR-ON";
var ResultOff = "TURN-LIGHTBAR-OVER-RIGHTWINDOW-BESIDE-DOOR-OFF";

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