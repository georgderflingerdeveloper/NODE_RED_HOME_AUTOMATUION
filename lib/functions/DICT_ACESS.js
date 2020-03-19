// name: DICT_ACESS
// outputs: 1
var NewMsg = { payload : {}, Initialized : 0 };
var Dictionary;
var PublicDictionary = "Dictionary";
var Init = "DictionaryIsInitialized";
var Initialized = global.get(Init||0);
NewMsg.Initialized = Initialized;

if( msg.topic === "DICTIONARY" )
{
    global.set(PublicDictionary, msg.payload);
    global.set(Init,1);
    NewMsg.payload = 'Initialisierung der "bot" Informationen...';
    return NewMsg;
    
}

if( msg.topic === "GetValueByKey" && Initialized )
{
    Dictionary = global.get(PublicDictionary);
    NewMsg.payload = Dictionary[msg.payload];

}

return NewMsg;