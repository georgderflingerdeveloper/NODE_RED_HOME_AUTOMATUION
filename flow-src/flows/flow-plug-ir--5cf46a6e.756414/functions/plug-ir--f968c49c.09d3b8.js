var result;
var ResultOn  = "POWER-PLUG-INFRA-RED-ON";
var ResultOff = "POWER-PLUG-INFRA-RED-OFF";

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


