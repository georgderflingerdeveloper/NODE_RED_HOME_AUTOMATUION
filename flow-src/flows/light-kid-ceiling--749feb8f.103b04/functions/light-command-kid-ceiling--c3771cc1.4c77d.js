var result;
var ResultOn  = "TURN-LIGHT-KIDROOM1-ON";
var ResultOff = "TURN-LIGHT-KIDROOM1-OFF";

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