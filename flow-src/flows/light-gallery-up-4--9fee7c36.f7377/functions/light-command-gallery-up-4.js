var result;
var ResultOn  = "TURN-GALLERY-UP4-ON";
var ResultOff = "TURN-GALLERY-UP4-OFF";

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