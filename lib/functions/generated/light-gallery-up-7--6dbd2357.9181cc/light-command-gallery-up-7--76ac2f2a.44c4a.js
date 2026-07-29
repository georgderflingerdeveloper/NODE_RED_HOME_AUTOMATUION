// name: LIGHT COMMAND GALLERY UP 7
// nodeId: 76ac2f2a.44c4a
// flow: LIGHT_GALLERY_UP_7
var result;
var ResultOn  = "TURN-GALLERY-UP7-ON";
var ResultOff = "TURN-GALLERY-UP7-OFF";

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