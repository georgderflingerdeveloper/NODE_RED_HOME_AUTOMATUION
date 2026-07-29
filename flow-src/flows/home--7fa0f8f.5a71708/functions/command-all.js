var result;
var ResultOn  = "TURN-ALL-LIGHTS-ON";
var ResultOff = "TURN-ALL-LIGHTS-OFF";

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