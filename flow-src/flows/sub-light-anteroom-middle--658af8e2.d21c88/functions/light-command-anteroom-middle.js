var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-MIDDLE-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-MIDDLE-OFF";

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