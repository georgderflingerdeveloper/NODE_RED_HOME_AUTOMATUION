// name: DICT_ACESS
// outputs: 1
var NewMsg = { payload : {} };
var Dictionary;
var PublicDictionary = "Dictionary";

if( msg.topic === "DICTIONARY" )
{
    global.set(PublicDictionary, msg.payload);
}

if( msg.topic === "GetValueByKey")
{
    Dictionary = global.get(PublicDictionary);
    NewMsg.payload = Dictionary[msg.payload];
}

return NewMsg;