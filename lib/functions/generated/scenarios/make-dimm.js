// name: MAKE_DIMM
// nodeId: 878f556e.dc77d8
// flow: SCENARIOS
var result;
var ToCompare = "DIMM";
if( msg.payload === ToCompare )
{
   result = true;
}
else
{
   result = false;
}
msg.payload = result;

return msg;