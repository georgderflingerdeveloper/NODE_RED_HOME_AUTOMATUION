// name: StoreLoadedDataIntoContext
// outputs: 1
var DefaultSettings =   { 
       payload: 
             {
               HourOn    : 4,
               MinuteOn  : 0, 
               HourOff   : 12, 
               MinuteOff : 0
             } 
       
   };

flow.set('TimeSettingsMemory',msg) || DefaultSettings;  

var LoadedSettings = flow.get('TimeSettingsMemory') || DefaultSettings;
msg = LoadedSettings;
return msg;