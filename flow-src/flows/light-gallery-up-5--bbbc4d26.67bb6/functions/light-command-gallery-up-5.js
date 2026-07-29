var result;
var ResultOn  = "TURN-GALLERY-UP5-ON";
var ResultOff = "TURN-GALLERY-UP5-OFF";

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