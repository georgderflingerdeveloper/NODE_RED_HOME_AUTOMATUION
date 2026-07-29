// name: LIGHT COMMAND GALLERY DOWN 1
// nodeId: 17f40115.67571f
// flow: LIGHT_GALLERY_DOWN_1
var result;
var ResultOn  = "TURN-GALLERY-DOWN-1-ON";
var ResultOff = "TURN-GALLERY-DOWN-1-OFF";

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