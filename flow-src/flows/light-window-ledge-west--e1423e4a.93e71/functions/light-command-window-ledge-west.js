var result;
var ResultOn  = "TURN-WINDOW-LEDGE-WEST-ON";
var ResultOff = "TURN-WINDOW-LEDGE-WEST-OFF";

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