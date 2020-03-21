// name: APPEND_TIMESTAMP
// outputs: 1
var NewMsg = { payload : "" };

var TimestampWithPayload = msg.mydate + " " + msg.mytimes + ":" + msg.mymillis + " Info : " +  msg.payload;

if( typeof msg.ActualValue !== "undefined" )
{
    NewMsg.payload = TimestampWithPayload + msg.ActualValue;
}
else
{
    NewMsg.payload = TimestampWithPayload;
}
return NewMsg;