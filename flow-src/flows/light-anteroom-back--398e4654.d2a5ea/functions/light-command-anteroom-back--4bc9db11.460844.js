var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-BACK-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-BACK-OFF";

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