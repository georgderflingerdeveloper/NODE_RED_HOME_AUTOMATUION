// name: LIGHT COMMAND WALL WEST
// nodeId: db8f3b2f.ceadb8
// flow: LIGHT_WALL_WEST
var result;
var ResultOn  = "TURN-LIGHTS-WALL-WEST-ON";
var ResultOff = "TURN-LIGHTS-WALL-WEST-OFF";

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