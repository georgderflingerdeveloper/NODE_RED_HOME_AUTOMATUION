var result;
var ResultOn  = "TURN-WINDOW-LEDGE-EAST-ON";
var ResultOff = "TURN-WINDOW-LEDGE-EAST-OFF";

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