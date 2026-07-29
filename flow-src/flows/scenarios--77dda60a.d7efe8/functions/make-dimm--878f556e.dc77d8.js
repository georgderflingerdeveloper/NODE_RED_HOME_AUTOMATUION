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