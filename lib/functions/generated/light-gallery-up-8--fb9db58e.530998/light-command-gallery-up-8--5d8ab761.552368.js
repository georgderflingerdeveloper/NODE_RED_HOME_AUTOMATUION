// name: LIGHT COMMAND GALLERY UP 8
// nodeId: 5d8ab761.552368
// flow: LIGHT_GALLERY_UP_8
var result;
var ResultOn  = "TURN-GALLERY-UP8-ON";
var ResultOff = "TURN-GALLERY-UP8-OFF";

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