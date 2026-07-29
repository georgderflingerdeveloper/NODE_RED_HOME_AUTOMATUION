// name: LIGHT COMMAND GALLERY UP 10
// nodeId: 3851963e.783a1a
// flow: LIGHT_GALLERY_UP_10
var result;
var ResultOn  = "TURN-GALLERY-UP10-ON";
var ResultOff = "TURN-GALLERY-UP10-OFF";

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