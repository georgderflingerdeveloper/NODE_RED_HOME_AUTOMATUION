var result;
var ResultOn  = "TURN-GALLERY-UP1-ON";
var ResultOff = "TURN-GALLERY-UP1-OFF";

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