// name: LIGHT COMMAND GALLERY UP 9
// nodeId: 2bb209b5.9fdf76
// flow: LIGHT_GALLERY_UP_9
var result;
var ResultOn  = "TURN-GALLERY-UP9-ON";
var ResultOff = "TURN-GALLERY-UP9-OFF";

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