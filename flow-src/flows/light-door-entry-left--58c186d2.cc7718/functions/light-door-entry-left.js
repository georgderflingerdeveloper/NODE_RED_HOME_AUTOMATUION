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