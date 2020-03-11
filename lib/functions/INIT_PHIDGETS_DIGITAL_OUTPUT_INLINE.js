// name: INIT_PHIDGETS_DIGITAL_OUTPUT_INLINE
// outputs: 1
var NewMsg = {};
var Config = {};
var phidget22      = global.get('phidget22');
var DigitalOutput = 0;
var IsInitialized = 0;
var ON             = 'ON';
var OFF            = 'OFF';
var Location;
var SerialNumber;
var HubPort;

var LogInfo;
var DigOutError;


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

Config = global.get("Config"||0);
if( Config)
{
    DigitalOutput = global.get(Config.DigitalOutput.PublicId);
    IsInitialized = global.get(Config.DigitalOutput.PublicInit);
    Location       = Config.VintHub.Location;
    SerialNumber   = Config.VintHub.serialnumber;
    HubPort        = Config.DigitalOutput.HubPort;
    LogInfo        = Location + ' with digital output '                 + HubPort + ' Serial number is: ' + SerialNumber;
    DigOutError    = Location + "Error setting digital output at port " + HubPort +  'Serial number is: ' + SerialNumber;
}



   DigitalOutput.onAttach = () => {
             global.set(Config.DigitalOutput.PublicInit, 1);
             console.log("Vinthub ATTACHED! " + LogInfo);
   };

   DigitalOutput.onDetach = () => {
             global.set(Config.DigitalOutput.PublicInit,  0);
             console.log("Vinthub DETACHED! " + LogInfo);
   }; 


if( IsInitialized  )
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

NewMsg = msg;

return(NewMsg);


