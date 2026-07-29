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