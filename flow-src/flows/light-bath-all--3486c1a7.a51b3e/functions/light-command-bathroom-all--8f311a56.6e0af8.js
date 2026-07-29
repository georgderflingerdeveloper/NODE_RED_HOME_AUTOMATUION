var result;
var ResultOn  = "TURN-LIGHT-BATHROOM-ALL-ON";
var ResultOff = "TURN-LIGHT-BATHROOM-ALL-OFF";

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