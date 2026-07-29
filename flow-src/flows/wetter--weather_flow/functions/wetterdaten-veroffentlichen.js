global.set("WeatherData", msg.payload);
msg.topic = "WeatherData";
node.status({
 fill: msg.payload.ActiveFlag ? "green" : "red",
 shape: msg.payload.ActiveFlag ? "dot" : "ring",
 text: msg.payload.WeatherServiceStatusText
});
return msg;