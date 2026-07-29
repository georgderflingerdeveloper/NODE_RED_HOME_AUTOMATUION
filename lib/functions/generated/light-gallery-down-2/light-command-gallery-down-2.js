// name: LIGHT COMMAND GALLERY DOWN 2
// nodeId: 92d9bb85.832db8
// flow: LIGHT_GALLERY_DOWN_2
var result;
var ResultOn  = "TURN-GALLERY-DOWN-2-ON";
var ResultOff = "TURN-GALLERY-DOWN-2-OFF";

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