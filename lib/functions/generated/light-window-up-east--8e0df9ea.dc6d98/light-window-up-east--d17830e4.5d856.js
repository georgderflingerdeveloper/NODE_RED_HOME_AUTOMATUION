// name: LIGHT_WINDOW_UP_EAST
// nodeId: d17830e4.5d856
// flow: LIGHT_WINDOW_UP_EAST
var result;
var ResultOn  = "TURN-LIGHT-WINDOW-SOUTHEAST-UPSIDE-ON";
var ResultOff = "TURN-LIGHT-WINDOW-SOUTHEAST-UPSIDE-OFF";

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