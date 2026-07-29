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