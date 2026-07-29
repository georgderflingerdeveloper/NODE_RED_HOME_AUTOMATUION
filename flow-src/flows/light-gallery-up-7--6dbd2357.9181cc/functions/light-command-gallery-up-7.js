var result;
var ResultOn  = "TURN-GALLERY-UP7-ON";
var ResultOff = "TURN-GALLERY-UP7-OFF";

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