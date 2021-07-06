// name: INCREMENT
// outputs: 1
// initialize: // Code added here will be run once\n// whenever the node is deployed.\n
// finalize: // Code added here will be run when the\n// node is being stopped or re-deployed.\n
// info: 
var NewMsg = {payload : 0};
NewMsg.payload = msg.payload + 1;
return NewMsg;