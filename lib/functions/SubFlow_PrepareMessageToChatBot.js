// name: PrepareMessageToChatBot
// outputs: 1
// initialize: // Code added here will be run once\n// whenever the node is deployed.\n
// finalize: // Code added here will be run when the\n// node is being stopped or re-deployed.\n
// info: 
var NewMsg     = {};
NewMsg.payload = {};
NewMsg.payload.chatId  = msg.chatId;
NewMsg.payload.type    = 'message';
if(  msg.payload !== "" && msg.payload !== null )
{
    NewMsg.payload.content = msg.payload;
}
return NewMsg;