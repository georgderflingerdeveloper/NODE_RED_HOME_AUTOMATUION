// name: IO_CONTROL_HEATER_1
// outputs: 1
var DigitalOutput0 = global.get('PublicDigitalOutput0');
var IsInitialized = global.get("PublicVintHubInit");

if( IsInitialized )
{
    if( msg.payload === 'ON')
    {
        DigitalOutput0.setDutyCycle(1);
    }

    if( msg.payload === 'OFF')
    {
        DigitalOutput0.setDutyCycle(0);
    }
}
    
return msg;