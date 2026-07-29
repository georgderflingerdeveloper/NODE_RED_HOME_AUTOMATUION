// name: LIGHT COMMAND KID 5
// nodeId: 46e96038.8662a
// flow: LIGHT_KID_5
var result;
var ResultOn  = "TURN-LIGHT-KIDROOM5-ON";
var ResultOff = "TURN-LIGHT-KIDROOM5-OFF";

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