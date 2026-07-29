var result;
var ResultOn  = "TURN-GALLERY-UP3-ON";
var ResultOff = "TURN-GALLERY-UP3-OFF";

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