// name: JoinTimeElements
// outputs: 1
NewMsg = { payload : {} };

NewMsg.payload = "Einschaltzeitpunkt gesetzt auf " + msg.payload.HourOn +  " h " +  msg.payload.MinuteOn + " minutes " +
                 "Ausschaltzeitpunkt gesetzt auf " + msg.payload.HourOff +  " h " +  msg.payload.MinuteOff + " minutes ";
   

return NewMsg;