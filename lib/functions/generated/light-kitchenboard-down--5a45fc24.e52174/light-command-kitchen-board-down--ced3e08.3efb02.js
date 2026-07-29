// name: LIGHT COMMAND KITCHEN BOARD DOWN
// nodeId: ced3e08.3efb02
// flow: LIGHT_KITCHENBOARD_DOWN
var result;
var ResultOn  = "TURN-KITCHEN-BOARD-DOWN-LIGHTS-ON";
var ResultOff = "TURN-KITCHEN-BOARD-DOWN-LIGHTS-OFF";

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