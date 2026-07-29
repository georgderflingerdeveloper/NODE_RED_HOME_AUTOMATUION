var result;
var ResultOn  = "TURN-LIGHT-TRIANGLE-SMALL-WEST-ON";
var ResultOff = "TURN-LIGHT-TRIANGLE-SMALL-WEST-OFF";

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