// name: DIGITAL_INPUT
// outputs: 1
var Config = msg.payload;
var phidget22          = global.get('phidget22')
var conn               = new phidget22.Connection( Config.VintHub.port, Config.VintHub.ipadress);
var HubPort            = Config.DigitalInput.HubPort;
var PhidgetObject      = new phidget22.DigitalInput();
var VintInfo = 'Serial number: ' + Config.VintHub.serialnumber + ' Digital input module at port ' + HubPort;

function StartInstance( Config, phidgetobject, hubport )
{
    phidgetobject.setHubPort(hubport);
    phidgetobject.setDeviceSerialNumber(Config.VintHub.serialnumber);
    phidgetobject.open(Config.VintHub.timeout).then(function () {})
       .catch(function(err) 
       {
	           console.error("Error during open " + VintInfo, err)
       }); 
    
    phidgetobject.onAttach = function onDevice_Attach() {
		console.log( 'Vinthub ATTACHED! ' + VintInfo );
	};

    phidgetobject.onDetach = function onDeviceSensor_Detach() {
		console.log( 'Vinthub DETACHED! ' + VintInfo );
	};
	
    phidgetobject.onStateChange = function DigitalInputState(state) {
        NewMsg.payload = state;
        node.send(NewMsg);
        node.done();
	};
}

conn.connect().then(StartInstance(Config, PhidgetObject, HubPort )).catch(function(err) {
	console.error("Error during connect " + VintInfo, err);
});

return( NewMsg );
