// name: INIT_PHIDGETS_DIGITAL_OUTPUT_INLINE
// outputs: 1
var NewMsg = {};
var Config = {};
var phidget22      = global.get('phidget22');
var DigitalOutput;
var ON             = 'ON';
var OFF            = 'OFF';

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

Config = global.get("Config");
DigitalOutput = global.get(Config.DigitalOutput.PublicId);

var Location       = Config.VintHub.Location;
var SerialNumber   = Config.VintHub.serialnumber;
var HubPort        = Config.DigitalOutput.HubPort;

var LogInfo       = Location + ' with digital output ' + HubPort + ' Serial number is: ' + SerialNumber;
var DigOutError    = Location + "Error setting digital output at port " + HubPort +  'Serial number is: ' + SerialNumber;

DigitalOutput.onAttach = () => {
        global.set(Config.DigitalOutput.PublicInit, 1);
 		console.log("Vinthub ATTACHED! " + LogInfo);
};

 DigitalOutput.onDetach = () => {
	    global.set(Config.DigitalOutput.PublicInit,  0);
		console.log("Vinthub DETACHED! " + LogInfo);
}; 

var IsInitialized = global.get(Config.DigitalOutput.PublicInit);

if( IsInitialized )
{
    if( msg.payload === ON)
    {
        DigitalOutput.setDutyCycle(1).catch( err => { console.error(DigOutError, err); } );
    }

    if( msg.payload === OFF)
    {
        DigitalOutput.setDutyCycle(0).catch( err => { console.error(DigOutError, err); } );
    }
}

NewMsg = global.get("Config");

return(NewMsg);


