let ExcessPower = msg.payload?.ExcessPowerWatt;
let newmsg = {};
newmsg.payload = ExcessPower;
return newmsg;