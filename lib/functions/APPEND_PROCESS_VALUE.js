// name: APPEND_PROCESS_VALUE
// outputs: 1
var PreviousMsg = { payload : 0 };
var NewMesg     = { payload : 0 };
var Storage     = "StorePreviousMessage";

if( msg.topic === "HasValue" )
{
    PreviousMsg = flow.get(Storage);
    NewMesg.payload =  PreviousMsg.payload + msg.payload;
}
else
{
    PreviousMsg.payload = msg.payload;
    flow.set(Storage, PreviousMsg );
    NewMesg = msg;
}

return NewMesg;