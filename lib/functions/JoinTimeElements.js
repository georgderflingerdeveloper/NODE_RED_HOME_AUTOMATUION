// name: JoinTimeElements
// outputs: 1
NewMsg = { payload : {} };

NewMsg.payload = "Einschaltzeitpunkt gesetzt auf " + msg.payload.HourOn +  " Uhr " +  msg.payload.MinuteOn + " Minuten " +
                 "Ausschaltzeitpunkt gesetzt auf " + msg.payload.HourOff +  " Uhr " +  msg.payload.MinuteOff + " Minuten ";
   

return NewMsg;