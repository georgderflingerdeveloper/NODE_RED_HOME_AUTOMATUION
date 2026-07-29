// name: BOILER COMMAND
// nodeId: 583ee5d6.cac97c
// flow: BOILER
var result;
var ResultOn  = "TURN-BOILER-ON";
var ResultOff = "TURN-BOILER-OFF";

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


