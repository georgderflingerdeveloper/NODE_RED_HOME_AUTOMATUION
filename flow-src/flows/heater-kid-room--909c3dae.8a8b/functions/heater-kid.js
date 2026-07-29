var result;
var ResultOn  = "TURN-HEATER-KID-ROOM-ON";
var ResultOff = "TURN-HEATER-KID-ROOM-OFF";

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