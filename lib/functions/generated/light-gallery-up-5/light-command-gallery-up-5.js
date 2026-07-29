// name: LIGHT COMMAND GALLERY UP 5
// nodeId: 1c8cf8a0.b34597
// flow: LIGHT_GALLERY_UP_5
var result;
var ResultOn  = "TURN-GALLERY-UP5-ON";
var ResultOff = "TURN-GALLERY-UP5-OFF";

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