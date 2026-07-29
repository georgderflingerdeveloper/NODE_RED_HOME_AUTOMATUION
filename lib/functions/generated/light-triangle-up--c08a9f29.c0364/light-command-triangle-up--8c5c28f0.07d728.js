// name: LIGHT COMMAND TRIANGLE UP
// nodeId: 8c5c28f0.07d728
// flow: LIGHT_TRIANGLE_UP
var result;
var ResultOn  = "TURN-TRIANAGLE-UPSTAIRS-ON";
var ResultOff = "TURN-TRIANAGLE-UPSTAIRS-OFF";

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