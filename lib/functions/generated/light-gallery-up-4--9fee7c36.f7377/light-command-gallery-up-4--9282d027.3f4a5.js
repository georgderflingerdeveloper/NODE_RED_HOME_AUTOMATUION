// name: LIGHT COMMAND GALLERY UP 4
// nodeId: 9282d027.3f4a5
// flow: LIGHT_GALLERY_UP_4
var result;
var ResultOn  = "TURN-GALLERY-UP4-ON";
var ResultOff = "TURN-GALLERY-UP4-OFF";

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