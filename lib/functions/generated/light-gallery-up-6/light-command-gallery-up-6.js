// name: LIGHT COMMAND GALLERY UP 6
// nodeId: c617dc83.01e63
// flow: LIGHT_GALLERY_UP_6
var result;
var ResultOn  = "TURN-GALLERY-UP6-ON";
var ResultOff = "TURN-GALLERY-UP6-OFF";

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