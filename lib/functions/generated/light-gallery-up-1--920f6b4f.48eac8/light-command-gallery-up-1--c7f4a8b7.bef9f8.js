// name: LIGHT COMMAND GALLERY UP 1
// nodeId: c7f4a8b7.bef9f8
// flow: LIGHT_GALLERY_UP_1
var result;
var ResultOn  = "TURN-GALLERY-UP1-ON";
var ResultOff = "TURN-GALLERY-UP1-OFF";

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