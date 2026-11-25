if (msg.topic !== 'house/lights' || typeof msg.payload !== 'boolean') return null;
const on = msg.payload;
// Each room uses the same command as its own dashboard controls.
return [
    {topic:'house/lights', payload:on},
    {topic:'light-controller/dashboard', payload:{Command:on ? 'AllLightsOn' : 'AllLightsOff'}},
    {topic:'georgszimmer/set', payload:{type:on ? 'on' : 'off'}},
    {topic:'sissi/light', payload:on}
];
