// name: LIGHT COMMAND GALLERY UP 3
// nodeId: eb8c74c5.c28818
// flow: LIGHT_GALLERY_UP_3
var result;
var ResultOn  = "TURN-GALLERY-UP3-ON";
var ResultOff = "TURN-GALLERY-UP3-OFF";

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