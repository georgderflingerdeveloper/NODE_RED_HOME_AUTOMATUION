var result;
var ResultOn  = "TURN-LIGHT-FLOOR-UP-ON";
var ResultOff = "TURN-LIGHT-FLOOR-UP-OFF";

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