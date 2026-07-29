// name: WINDOW LEDGE EAST COMMAND
// nodeId: 5ab8ac96.b9b9a4
// flow: LIGHT_WINDOW_LEDGE_EAST
var result;
var ResultOn  = "TURN-WINDOW-LEDGE-EAST-ON";
var ResultOff = "TURN-WINDOW-LEDGE-EAST-OFF";

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