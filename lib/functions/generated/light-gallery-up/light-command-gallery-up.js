// name: LIGHT_ COMMAND_GALLERY_UP
// nodeId: 919e20c8.c749a
// flow: LIGHT_GALLERY_UP
var result;
var ResultOn  = "TURN-GALLERY-UP-ON";
var ResultOff = "TURN-GALLERY-UP-OFF";

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