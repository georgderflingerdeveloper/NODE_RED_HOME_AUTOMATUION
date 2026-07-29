// name: LIGHT COMMAND GALLERY DOWN 3
// nodeId: bed70e4.0186af
// flow: LIGHT_GALLERY_DOWN_3
var result;
var ResultOn  = "TURN-GALLERY-DOWN-3-ON";
var ResultOff = "TURN-GALLERY-DOWN-3-OFF";

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