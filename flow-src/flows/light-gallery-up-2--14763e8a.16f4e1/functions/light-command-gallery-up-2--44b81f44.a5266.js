var result;
var ResultOn  = "TURN-GALLERY-UP2-ON";
var ResultOff = "TURN-GALLERY-UP2-OFF";

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