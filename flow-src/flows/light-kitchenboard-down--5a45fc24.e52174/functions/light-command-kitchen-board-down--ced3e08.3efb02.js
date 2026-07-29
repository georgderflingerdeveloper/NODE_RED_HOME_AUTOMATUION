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