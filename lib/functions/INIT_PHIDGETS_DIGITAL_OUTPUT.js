// name: INIT_PHIDGETS_DIGITAL_OUTPUT
// outputs: 1
var NewMsg         = { payload : ''};
var Config         = msg.payload;
var phidget22      = global.get('phidget22')
var conn           = new phidget22.Connection(Config.VintHub.port, Config.VintHub.ipadress);
var Initialized    = context.get('init') || 0;
var digitalOutput  = new phidget22.DigitalOutput();

var PublicId     = Config.DigitalOutput.PublicId;    
var PublicInit   = Config.DigitalOutput.PublicInit;
var SerialNumber = Config.VintHub.serialnumber;
var Timeout      = Config.VintHub.timeout;
var HubPort      = Config.DigitalOutput.HubPort;
var Location     = Config.VintHub.location;
var LogInfo      = 'Vinthub ' +  Location + ' with digital output' + HubPort + ' Serial number is:' + SerialNumber;

digitalOutput.onAttach = () => {
 		console.log(LogInfo);
	};

digitalOutput.onDetach = () => {
	    global.set(PublicInit, 0);
		console.log(LogInfo);
	};


function Start()
{
    digitalOutput.setIsHubPortDevice(true);
    digitalOutput.setHubPort(HubPort);
    digitalOutput.setDeviceSerialNumber(SerialNumber);
    digitalOutput.open(Timeout).then( () =>
    {
       global.set(PublicId, digitalOutput);
       global.set(PublicInit, 1);
    });
}

conn.connect().then(Start).catch(function(err) {
	console.error("Error during connect:", err);
});

return NewMsg;