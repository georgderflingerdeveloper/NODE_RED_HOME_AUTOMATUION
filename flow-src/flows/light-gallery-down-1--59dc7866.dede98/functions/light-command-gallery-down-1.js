var result;
var ResultOn  = "TURN-GALLERY-DOWN-1-ON";
var ResultOff = "TURN-GALLERY-DOWN-1-OFF";

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