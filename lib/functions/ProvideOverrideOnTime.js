// name: ProvideOverrideOnTime
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
var OnOverride = "On_Override ";

NewMsg.payload = OnOverride+ TimeSettings.payload.HourOn + ":" + TimeSettings.payload.MinuteOn;


return NewMsg;
