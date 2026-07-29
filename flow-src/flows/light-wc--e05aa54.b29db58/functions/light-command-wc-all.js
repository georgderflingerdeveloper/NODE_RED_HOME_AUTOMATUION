var result;
var ResultOn  = "TURN-LIGHT-WASHROOM-ON";
var ResultOff = "TURN-LIGHT-WASHROOM-OFF";

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