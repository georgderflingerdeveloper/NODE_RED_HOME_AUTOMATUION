var result;
var ResultOn  = "TURN-HEATER-BODY-WEST-ON";
var ResultOff = "TURN-HEATER-BODY-WEST-OFF";

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


