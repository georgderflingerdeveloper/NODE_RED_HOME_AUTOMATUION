// name: APPEND_TIMESTAMP
// outputs: 1
var NewMsg = { payload : "" };
NewMsg.payload = msg.mydate + " " + msg.mytimes + ":" + msg.mymillis + " Info : " +  msg.payload;
return NewMsg;