// name: PrepareTimeData
// outputs: 1
var NewMsg = {};

 
var DefaultSettings =   { 
       payload: 
             {
               HourOn    : 4,
               MinuteOn  : 0, 
               HourOff   : 12, 
               MinuteOff : 0
             } 
       
   };

var TimeSettings=flow.get('TimeSettingsMemory') || DefaultSettings;


switch( msg.topic)
{
    case "HourOn":
         TimeSettings.payload.HourOn = msg.payload;
         break;

    case "MinuteOn":
         TimeSettings.payload.MinuteOn = msg.payload;
         break;
         
    case "HourOff":
         TimeSettings.payload.HourOff = msg.payload;
         break;

    case "MinuteOff":
         TimeSettings.payload.MinuteOff = msg.payload;
         break;     
         
}

flow.set('TimeSettingsMemory',TimeSettings);

NewMsg = TimeSettings;
return NewMsg;