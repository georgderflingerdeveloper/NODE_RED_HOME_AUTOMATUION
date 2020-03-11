// name: INIT_PHIDGETS_DIGITAL_OUTPUT_INLINE
// outputs: 1
var NewMsg = {};
var Config = {};
var phidget22      = global.get('phidget22');
var DigitalOutput;

function Start(digitalOutput, config)
{
    digitalOutput.setIsHubPortDevice(true);
    digitalOutput.setHubPort(config.DigitalOutput.HubPort);
    digitalOutput.setDeviceSerialNumber(config.VintHub.serialnumber);
    digitalOutput.open(config.VintHub.timeout).then( () =>
    {
       global.set(Config.DigitalOutput.PublicInit, 1);
    });
}

if( msg.topic === "TOPIC_CONFIG_VINT_HUB_OFFICE" )
{
    Config         = msg.payload;
    global.set("Config",Config);
    var conn           = new phidget22.Connection(Config.VintHub.port, Config.VintHub.ipadress);
    DigitalOutput = new phidget22.DigitalOutput();
    global.set(Config.DigitalOutput.PublicId,DigitalOutput);
    conn.connect().then(Start(DigitalOutput, Config)).catch( err => {
    	console.error("Error during connect:" + LogInfo, err);
    });
}

DigitalOutput = global.get(Config.DigitalOutput.PublicId);

var Location       = Config.VintHub.Location;
var SerialNumber   = Config.VintHub.serialnumber;
var HubPort        = Config.DigitalOutput.HubPort;

var LogInfo    = 'Vinthub ' +  Location + ' with digital output ' + HubPort + ' Serial number is: ' + SerialNumber;

DigitalOutput.onAttach = () => {
 		console.log("ATTACHED! " + LogInfo);
};

 DigitalOutput.onDetach = () => {
	    global.set(Config.DigitalOutput.PublicInit,  0);
		console.log("DETACHED! " + LogInfo);
}; 

NewMsg = global.get("Config");

return(NewMsg);


