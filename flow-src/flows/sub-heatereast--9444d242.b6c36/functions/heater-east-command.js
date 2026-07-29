var result;
var ResultOn  = "TURN-HEATER-BODY-EAST-ON";
var ResultOff = "TURN-HEATER-BODY-EAST-OFF";

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


