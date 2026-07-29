var result;
var ResultOn  = "TURN-LIGHT-KIDROOM2-ON";
var ResultOff = "TURN-LIGHT-KIDROOM2-OFF";

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