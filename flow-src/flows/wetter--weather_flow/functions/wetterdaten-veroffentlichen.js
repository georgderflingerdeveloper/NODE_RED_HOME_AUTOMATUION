global.set("WeatherData", msg.payload);
if (msg.payload.ActiveFlag === true) {
 global.set("WeatherLastValidData", msg.payload);
}
msg.topic = "WeatherData";
node.status({
 fill: msg.payload.ActiveFlag ? "green" : "red",
 shape: msg.payload.ActiveFlag ? "dot" : "ring",
 text: msg.payload.WeatherServiceStatusText
});
return msg;
