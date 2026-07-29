var result;
var ResultOn  = "TURN-LIGHT-ANTEROOM-MAIN-ON";
var ResultOff = "TURN-LIGHT-ANTEROOM-MAIN-OFF";

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