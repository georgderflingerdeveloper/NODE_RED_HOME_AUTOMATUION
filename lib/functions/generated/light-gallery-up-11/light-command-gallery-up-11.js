// name: LIGHT COMMAND GALLERY UP 11
// nodeId: 5698937a.c33e4c
// flow: LIGHT_GALLERY_UP_11
var result;
var ResultOn  = "TURN-GALLERY-UP11-ON";
var ResultOff = "TURN-GALLERY-UP11-OFF";

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