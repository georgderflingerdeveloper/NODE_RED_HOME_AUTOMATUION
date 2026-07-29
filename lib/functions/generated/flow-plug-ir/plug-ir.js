// name: PLUG-IR
// nodeId: f968c49c.09d3b8
// flow: FLOW_PLUG_IR
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


