var result;
var ResultOn  = "TURN-LIGHTS-WALL-WEST-ON";
var ResultOff = "TURN-LIGHTS-WALL-WEST-OFF";

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