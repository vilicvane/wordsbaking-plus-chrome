var settings = {
    cacheTimeout: 7 * 24 * 3600 * 1000,
    defaultMeaningsNumber: 3
};

var options = {
    autoAudio: true,
    popupCtrlKey: true,
    popupDblClick: true,
    email: undefined,
    password: undefined
};

chrome.storage.sync.get("options", function (items) {
    options = items.options || options;
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace == 'sync' && changes.hasOwnProperty('options')) {
        options = changes.options.newValue;
    }
});