var result;
var ResultOn  = "TURN-LIGHT-OUTSIDE-ON";
var ResultOff = "TURN-LIGHT-OUTSIDE-OFF";

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