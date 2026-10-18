// name: DICT_ACESS
// outputs: 1
const PublicDictionary = "Dictionary";
const Init = "DictionaryIsInitialized";
const defaultMessage = {
    payload: {},
    Initialized: false,
    ActualValue: 'none'
};

const message = msg || {};
const initialized = !!global.get(Init);

if (message.topic === "DICTIONARY") {
    global.set(PublicDictionary, message.payload || {});
    global.set(Init, true);

    return {
        payload: 'Initialisierung der "bot" Informationen...',
        Initialized: true,
        ActualValue: 'none'
    };
}

if (message.topic === "GetValueByKey") {
    if (!initialized) {
        return {
            ...defaultMessage,
            Initialized: false
        };
    }

    const dictionary = global.get(PublicDictionary) || {};
    const key = message.payload;
    const value = dictionary[key];

    return {
        payload: value,
        Initialized: true,
        ActualValue: message.ActualValue !== undefined ? message.ActualValue : 'none'
    };
}

return {
    ...defaultMessage,
    Initialized: initialized
};