var result;
var ResultOn  = "TURN-BOILER-ON";
var ResultOff = "TURN-BOILER-OFF";

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


