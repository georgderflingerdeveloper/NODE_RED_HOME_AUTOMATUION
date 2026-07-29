var result;
var ResultOn  = "TURN-GALLERY-DOWN-2-ON";
var ResultOff = "TURN-GALLERY-DOWN-2-OFF";

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