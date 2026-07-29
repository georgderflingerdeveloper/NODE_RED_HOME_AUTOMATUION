// name: LIGHT COMMAND ANTEROOM GALLERY UP
// nodeId: f4f718ca.73ad78
// flow: ANTEROOM_GALLERY_UP
var result;
var ResultOn  = "TURN-LIGHT-FLOOR-UP-ON";
var ResultOff = "TURN-LIGHT-FLOOR-UP-OFF";

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