var result;
var ResultOn  = env.get('CMD_ON');
var ResultOff = env.get('CMD_OFF');

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