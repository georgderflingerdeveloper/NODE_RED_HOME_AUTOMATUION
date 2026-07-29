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