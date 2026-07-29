var result;
var ResultOn  = "TURN-LIGHT-KIDROOM3-ON";
var ResultOff = "TURN-LIGHT-KIDROOM3-OFF";

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