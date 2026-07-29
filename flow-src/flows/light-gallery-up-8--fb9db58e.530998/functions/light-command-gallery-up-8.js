var result;
var ResultOn  = "TURN-GALLERY-UP8-ON";
var ResultOff = "TURN-GALLERY-UP8-OFF";

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