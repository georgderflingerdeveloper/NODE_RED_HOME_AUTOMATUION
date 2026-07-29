// name: LIGHT COMMAND WINDOW LEDGE WEST
// nodeId: bcb0c415.ab2f18
// flow: LIGHT_WINDOW_LEDGE_WEST
var result;
var ResultOn  = "TURN-WINDOW-LEDGE-WEST-ON";
var ResultOff = "TURN-WINDOW-LEDGE-WEST-OFF";

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