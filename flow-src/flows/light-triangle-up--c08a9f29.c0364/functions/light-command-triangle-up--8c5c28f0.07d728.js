var result;
var ResultOn  = "TURN-TRIANAGLE-UPSTAIRS-ON";
var ResultOff = "TURN-TRIANAGLE-UPSTAIRS-OFF";

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