// name: LIGHT DOOR ENTRY LEFT
// nodeId: 7d276b21.d1de14
// flow: LIGHT_DOOR_ENTRY_LEFT
var result;
var ResultOn  = "TURN-WINDOW-LIGHT-DOOR-ENTRY-LEFT-ON";
var ResultOff = "TURN-WINDOW-LIGHT-DOOR-ENTRY-LEFT-OFF";

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