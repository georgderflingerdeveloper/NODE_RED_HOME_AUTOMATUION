// name: LIGHT TRIANGLE WEST
// nodeId: db3b4d8f.7e919
// flow: LIGHT_TRIANGLE_WEST
var result;
var ResultOn  = "TURN-LIGHT-TRIANGLE-SMALL-WEST-ON";
var ResultOff = "TURN-LIGHT-TRIANGLE-SMALL-WEST-OFF";

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