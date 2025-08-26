// name: DIGITAL_OUTPUT_CONTROL
// outputs: 1
var Config        = 0;
var PublicId      = 0;
var PublicInit    = 0;

var DigitalOutput = 0;
var IsInitialized = 0;

if( msg.topic === "TOPIC_CONFIG_VINT_HUB_OFFICE" )
{
    Config        = msg.payload.DigitalOutput;
    PublicId      = Config.PublicId;
    PublicInit    = Config.PublicInit;

    DigitalOutput = global.get(PublicId);
    IsInitialized = global.get(PublicInit);
}

if( IsInitialized )
{
    if( msg.payload === 'ON')
    {
        DigitalOutput.setDutyCycle(1);
    }

    if( msg.payload === 'OFF')
    {
        DigitalOutput.setDutyCycle(0);
    }
 }

    
return msg;