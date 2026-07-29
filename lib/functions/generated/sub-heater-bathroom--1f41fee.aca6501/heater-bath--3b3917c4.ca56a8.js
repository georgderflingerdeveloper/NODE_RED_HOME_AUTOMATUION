// name: HEATER BATH
// nodeId: 3b3917c4.ca56a8
// flow: SUB_HEATER_BATHROOM
var result;
var ResultOn  = "TURN-HEATER-BATH-ON";
var ResultOff = "TURN-HEATER-BATH-OFF";

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


