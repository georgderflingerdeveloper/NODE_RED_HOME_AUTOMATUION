var result;
var ResultOn  = "TURN-HEATER-BATH-ON";
var ResultOff = "TURN-HEATER-BATH-OFF";

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


