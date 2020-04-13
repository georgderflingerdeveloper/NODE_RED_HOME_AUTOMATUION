// name: DIGITAL_INPUT
// outputs: 1
var NewMsg = {};
var Config = msg.payload;
var phidget22          = global.get('phidget22')
var conn               = new phidget22.Connection( Config.VintHub.port, Config.VintHub.ipadress);
var HubPort            = Config.DigitalInput.HubPort;
var Channel            = Config.DigitalInput.Channel;
var PhidgetObject      = new phidget22.DigitalInput();
var VintInfo           = ' Serial number: '                + Config.VintHub.serialnumber + 
                         ' Digital input module at port: ' + HubPort + 
                         ' Configured channel: '           + Channel;

function StartInstance( Config, phidgetobject, hubport )
{
    phidgetobject.setHubPort(hubport);
    phidgetobject.setChannel(Channel);
    phidgetobject.setDeviceSerialNumber(Config.VintHub.serialnumber);
    phidgetobject.open(Config.VintHub.timeout).then( () => {})
       .catch((err) =>
       {
	           console.error("Error during open " + VintInfo, err)
       }); 
    
    phidgetobject.onAttach = () => {
		console.log( 'Vinthub ATTACHED! ' + VintInfo );
	};

    phidgetobject.onDetach = () => {
		console.log( 'Vinthub DETACHED! ' + VintInfo );
	};
	
    phidgetobject.onStateChange = (state) => {
        NewMsg.payload = state;
        node.send(NewMsg);
        console.log( VintInfo + ' Status digital input ' + state );
        node.done();
	};
}

conn.connect().then(StartInstance(Config, PhidgetObject, HubPort )).catch((err) =>{
	console.error("Error during connect " + VintInfo, err);
});

return( NewMsg );
