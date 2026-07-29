// name: MAKE_ADVENTURE
// nodeId: 34d1e102.250d5e
// flow: SCENARIOS
var result;
var ToCompare = "ADVENTURE";
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