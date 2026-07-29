var result;
var ResultOn  = "TURN-GALLERY-UP9-ON";
var ResultOff = "TURN-GALLERY-UP9-OFF";

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