// name: PHIDGETS_TEMPERATURE_MODULE
// outputs: 1
var NewMsg = { topic : "Temperaturesensor", payload : 0, DecimalPlaces : 1 };
var phidget22 = global.get('phidget22')
var Config = msg.payload;

const PhidgetObjectType = 
{
    TemperatureSensor : 1
}

var conn = new phidget22.Connection( Config.VintHub.port, Config.VintHub.ipadress);
var HubPortTemperaureModule = 2;

var temperatureSensor0 = new phidget22.TemperatureSensor();
var VintInfo = 'Serial number: ' + Config.VintHub.serialnumber + ' Temperature module at port ' + HubPortTemperaureModule;

    temperatureSensor0.onAttach = function onTemperatureSensor0_Attach() {
		console.log( 'OFFICE Vinthub ATTACHED! ' + VintInfo );
	};

    temperatureSensor0.onDetach = function onDigitalOutput0_Detach() {
		console.log( 'OFFICE Vinthub DETACHED! ' + VintInfo );
	};
	
    temperatureSensor0.onTemperatureChange = function TemperatureChange(temperature) {
        NewMsg.payload = temperature;
        node.send(NewMsg);
        node.done();
	};


function StartInstance( Config, phidgetobject, hubport, phidgettype )
{
    phidgetobject.setHubPort(hubport);
    phidgetobject.setDeviceSerialNumber(Config.VintHub.serialnumber);
    phidgetobject.setDataInterval(Config.TemperatureSensor.UpdateIntervall);
    phidgetobject.open(Config.VintHub.timeout).then(function () {}); 
}

conn.connect().then(StartInstance(Config,
                                  temperatureSensor0, 
                                  HubPortTemperaureModule,
                                  PhidgetObjectType.TemperaturSensor )).catch(function(err) {
	console.error("Error during connect " + VintInfo, err);
});

return( NewMsg );



