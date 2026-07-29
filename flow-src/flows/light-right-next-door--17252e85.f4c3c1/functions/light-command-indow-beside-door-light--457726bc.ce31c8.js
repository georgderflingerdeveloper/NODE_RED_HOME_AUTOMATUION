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