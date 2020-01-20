// name: SwitchOutput
// outputs: 1
exports.Switch = function( initialized, digout, msg )
{
  if( initialized )
  {
    if( msg.payload === 'ON')
    {
        digout.setDutyCycle(1);
    }

    if( msg.payload === 'OFF')
    {
        digout.setDutyCycle(0);
    }
  }   
}


    

