// name: LIGHT COMMAND GALLERY DOWN
// nodeId: 219271c2.3aeb5e
// flow: LIGHT_GALLERY_DOWN
var result;
var ResultOn  = "TURN-GALLERY-DOWN-ON";
var ResultOff = "TURN-GALLERY-DOWN-OFF";

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