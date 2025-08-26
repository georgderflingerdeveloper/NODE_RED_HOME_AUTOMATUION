// name: JoinLimits
// outputs: 1
// initialize: // Code added here will be run once\n// whenever the node is deployed.\n
// finalize: // Code added here will be run when the\n// node is being stopped or re-deployed.\n
// info: 
NewMsg = {};
 
NewMsg.payload = "Temperaturregler oberes limit gesetzt auf "  + global.get('UpperTemperatureLimit') +  " °C " +
                 "unteres limit gesetzt auf " + global.get('LowerTemperatureLimit')   +  " °C ";
   

return NewMsg;