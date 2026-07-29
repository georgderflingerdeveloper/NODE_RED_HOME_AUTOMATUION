var result;
var ResultOn  = "TURN-GALLERY-DOWN-ON";
var ResultOff = "TURN-GALLERY-DOWN-OFF";

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