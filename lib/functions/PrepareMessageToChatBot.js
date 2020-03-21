// name: PrepareMessageToChatBot
// outputs: 1
var NewMsg = {};
NewMsg.payload = {};
NewMsg.payload.chatId  = 852123642;
NewMsg.payload.type    = 'message';
if(  msg.payload !== "" && msg.payload !== null )
{
    NewMsg.payload.content = msg.payload;
}
return NewMsg;
