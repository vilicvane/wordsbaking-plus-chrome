/// <reference path="langs.js" />
/// <reference path="jquery.js" />
/// <reference path="common.js" />

chrome.runtime.onMessage.addListener(function (message, sender, callback) {
    var type = message.type;
    var args = message.args.concat();
    switch (type) {
        case "fetchResult":
            args.push(function (complete, result) {
                if (complete) {
                    callback(result);
                }
            });
            return fetchResult.apply(null, args);
        default:
            args.push(callback);
            return self[type].apply(args);
    }
});

(function () {
    chrome.storage.local.get(function (items) {
        var keys = [];
        var now = new Date().getTime();
        for (var i in items) {
            if (/^requestCache\./.test(i)) {
                var item = items[i];
                if (item.time + 7 * 24 * 3600 * 1000 < now) {
                    keys.push(i);
                }
            }
        }
        chrome.storage.local.remove(keys);
    });
})();