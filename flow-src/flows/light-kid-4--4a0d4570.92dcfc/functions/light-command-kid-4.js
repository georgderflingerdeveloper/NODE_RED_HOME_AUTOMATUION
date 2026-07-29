var result;
var ResultOn  = "TURN-LIGHT-KIDROOM4-ON";
var ResultOff = "TURN-LIGHT-KIDROOM4-OFF";

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