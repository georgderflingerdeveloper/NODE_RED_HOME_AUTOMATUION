// name: PHIDGETS_HUMIDITY_MODULE
// outputs: 1
var Config = msg.payload;
var NewMsg = { topic : "HumiditySensor", payload : 0, DecimalPlaces : Config.TemperatureSensor.Precision };
var phidget22          = global.get('phidget22')
var conn               = new phidget22.Connection( Config.VintHub.port, Config.VintHub.ipadress);
var HubPort            = Config.HumiditySensor.HubPort;
var sensor             = new phidget22.HumiditySensor();
var VintInfo = 'Serial number: ' + Config.VintHub.serialnumber + ' Humitidy module at port ' + HubPort;

function StartInstance( Config, phidgetobject, hubport )
{
    phidgetobject.setHubPort(hubport);
    phidgetobject.setDeviceSerialNumber(Config.VintHub.serialnumber);
    phidgetobject.open(Config.VintHub.timeout).then(function () {}).catch(function(err) {
	console.error("Error during open " + VintInfo, err)}); 
    
    phidgetobject.onAttach = function onTemperatureSensor_Attach() {
		console.log( 'Vinthub ATTACHED! ' + VintInfo );
	};

    phidgetobject.onDetach = function onTemperatureSensor_Detach() {
		console.log( 'Vinthub DETACHED! ' + VintInfo );
	};
	
    phidgetobject.onHumidityChange = function ValueChange(humidity) {
        NewMsg.payload = humidity;
        node.send(NewMsg);
        node.done();
	};
}

conn.connect().then(StartInstance(Config, sensor, HubPort )).catch(function(err) {
	console.error("Error during connect " + VintInfo, err);
});

return( NewMsg );



