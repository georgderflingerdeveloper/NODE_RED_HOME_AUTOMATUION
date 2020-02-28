// name: PHIDGETS_TEMPERATURE_MODULE
// outputs: 1
var Config = msg.payload;
var NewMsg = { topic : "TemperatureSensor", payload : 0, DecimalPlaces : Config.TemperatureSensor.Precision };
var phidget22          = global.get('phidget22')
var conn               = new phidget22.Connection( Config.VintHub.port, Config.VintHub.ipadress);
var HubPort            = Config.TemperatureSensor.HubPort;
var PhidgetObject      = new phidget22.TemperatureSensor();
var VintInfo = 'Serial number: ' + Config.VintHub.serialnumber + ' Temperature module at port ' + HubPort;

function StartInstance( Config, phidgetobject, hubport )
{
    phidgetobject.setHubPort(hubport);
    phidgetobject.setDeviceSerialNumber(Config.VintHub.serialnumber);
    phidgetobject.open(Config.VintHub.timeout).then(function () {})
       .catch(function(err) 
       {
	           console.error("Error during open " + VintInfo, err)
       }); 
    
    phidgetobject.onAttach = function onTemperatureSensor_Attach() {
		console.log( 'Vinthub ATTACHED! ' + VintInfo );
	};

    phidgetobject.onDetach = function onTemperatureSensor_Detach() {
		console.log( 'Vinthub DETACHED! ' + VintInfo );
	};
	
    phidgetobject.onTemperatureChange = function TemperatureChange(temperature) {
        NewMsg.payload = temperature;
        node.send(NewMsg);
        node.done();
	};
}

conn.connect().then(StartInstance(Config, PhidgetObject, HubPort )).catch(function(err) {
	console.error("Error during connect " + VintInfo, err);
});

return( NewMsg );



