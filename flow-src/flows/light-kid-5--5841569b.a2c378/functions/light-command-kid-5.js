var result;
var ResultOn  = "TURN-LIGHT-KIDROOM5-ON";
var ResultOff = "TURN-LIGHT-KIDROOM5-OFF";

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