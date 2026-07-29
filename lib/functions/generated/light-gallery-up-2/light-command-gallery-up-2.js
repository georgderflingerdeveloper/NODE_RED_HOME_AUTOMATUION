// name: LIGHT COMMAND GALLERY UP 2
// nodeId: 44b81f44.a5266
// flow: LIGHT_GALLERY_UP_2
var result;
var ResultOn  = "TURN-GALLERY-UP2-ON";
var ResultOff = "TURN-GALLERY-UP2-OFF";

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