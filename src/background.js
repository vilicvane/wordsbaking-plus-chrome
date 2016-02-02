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

    chrome.runtime.onMessage.addListener(function (message, sender, callback) {
        switch (message.type) {
            case 'request':
                $.getJSON(message.url).success(function (data) {
                    callback({
                        data: data,
                        success: true
                    });
                }).error(function () {
                    callback({
                        data: null,
                        success: false
                    });
                });
                return true;
        }
    });
})();
