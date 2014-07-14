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