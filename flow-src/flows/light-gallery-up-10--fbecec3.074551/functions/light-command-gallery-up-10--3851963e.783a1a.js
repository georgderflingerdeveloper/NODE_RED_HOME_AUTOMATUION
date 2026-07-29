var result;
var ResultOn  = "TURN-GALLERY-UP10-ON";
var ResultOff = "TURN-GALLERY-UP10-OFF";

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