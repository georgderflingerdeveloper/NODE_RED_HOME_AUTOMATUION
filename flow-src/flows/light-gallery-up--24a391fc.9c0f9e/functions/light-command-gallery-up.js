var result;
var ResultOn  = "TURN-GALLERY-UP-ON";
var ResultOff = "TURN-GALLERY-UP-OFF";

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