var result;
var ResultOn  = "TURN-GALLERY-UP11-ON";
var ResultOff = "TURN-GALLERY-UP11-OFF";

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