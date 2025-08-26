// name: ProvideOverrideOffTime
// outputs: 1
var NewMsg = {payload : 0};

var DefaultSettings =   { 
       payload: 
             {
               HourOn    : 0,
               MinuteOn  : 0, 
               HourOff   : 0, 
               MinuteOff : 0
             } 
       
   };
   

var TimeSettings=global.get('TimeSettingsMemory2') || DefaultSettings;
var OffOverride = "Off_Override ";

NewMsg.payload = OffOverride+ TimeSettings.payload.HourOff + ":" + TimeSettings.payload.MinuteOff;


return NewMsg;
