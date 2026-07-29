var result;
var ResultOn  = "TURN-GALLERY-UP6-ON";
var ResultOff = "TURN-GALLERY-UP6-OFF";

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