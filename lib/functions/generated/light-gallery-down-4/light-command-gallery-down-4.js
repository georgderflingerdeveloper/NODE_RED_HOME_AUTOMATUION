// name: LIGHT COMMAND GALLERY DOWN 4
// nodeId: 76dfd902.5d3618
// flow: LIGHT_GALLERY_DOWN_4
var result;
var ResultOn  = "TURN-GALLERY-DOWN-4-ON";
var ResultOff = "TURN-GALLERY-DOWN-4-OFF";

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