var result;
var ResultOn  = "TURN-GALLERY-DOWN-3-ON";
var ResultOff = "TURN-GALLERY-DOWN-3-OFF";

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