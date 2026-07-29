// name: HEATER WEST COMMAND
// nodeId: 2425aabe.c3d216
// flow: SUB_HEATERWEST
var result;
var ResultOn  = "TURN-HEATER-BODY-WEST-ON";
var ResultOff = "TURN-HEATER-BODY-WEST-OFF";

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


