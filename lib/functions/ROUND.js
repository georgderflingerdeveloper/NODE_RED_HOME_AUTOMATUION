// name: ROUND
// outputs: 1
NewMsg = { 'payload' : 0 }

function roundNumber(num, dec) {
  return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
}

NewMsg.payload = roundNumber( msg.payload, msg.DecimalPlaces );

return NewMsg;