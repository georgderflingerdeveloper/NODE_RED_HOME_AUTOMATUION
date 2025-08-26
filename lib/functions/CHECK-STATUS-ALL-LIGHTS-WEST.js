// name: CHECK STATUS ALL LIGHTS WEST
// outputs: 1
var result;
var ToCompare = "ALL-LIGHTS-WEST-ARE-ON";
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