/// <reference path="langs.js" />
/// <reference path="settings.js" />
/// <reference path="jquery.js" />

(function () {
    self.splitWords = function (str, prefix, isHtml) {
        if (isHtml) {
            str = decodeHtml(str);
        }

        str = str.replace(/\s{2,}/g, ' ');

        var parts = [];
        var re = /[a-z0-9-]+/ig;
        while (str) {
            re.lastIndex = 0;
            var groups = re.exec(str);
            if (groups) {
                var index = re.lastIndex - groups[0].length;
                if (index > 0) {
                    parts.push({
                        isWord: false,
                        text: str.substr(0, index)
                    });
                }
                parts.push({
                    isWord: true,
                    text: groups[0]
                });
                str = str.substr(re.lastIndex);
            }
            else {
                parts.push({
                    isWord: false,
                    text: str
                });
                str = "";
            }
        }
        var html = "";
        for (var i = 0; i < parts.length; i++) {
            html += '<span class="' + prefix + '-' + parts[i].isWord + '">' + encodeHtml(parts[i].text) + '</span>';
        }

        return html;
    };

    self.fetchResult = fetchResult;
    self.addResultMethods = addResultMethods;

    var api = new function () {
        this.call = function (path, data, callback) {
            if (!options.email || !options.password) {
                callback(null, false);
                return;
            }

            data.email = options.email;
            data.password = options.password;

            $.post(apiBaseUrl + path, data).done(function (res) {
                if (res.error) {
                    if (res.error > 2000 && res.error < 3000) {
                        switch (res.error) {
                            case 2001:
                                options.password = undefined;
                                break;
                            case 2002:
                                options.email = undefined;
                                options.password = undefined;
                                break;
                            default:
                                break;
                        }

                        chrome.storage.sync.set({
                            options: options
                        });

                        callback(null, false);
                    }
                    else {
                        callback(null, true);
                    }
                }
                else {
                    callback(res, true);
                }
            }).fail(function () {
                callback(null, true);
            });

        };
    }();

    var apiBaseUrl = 'https://api.wordsbaking.com/';

    self.wordsbookExists = function (headword, callback) {
        api.call('wordsbook/exists', {
            word: headword
        }, function (res, validAccount) {
            callback(validAccount, res && res.data.exists);
        });
    };

    self.addToWordsbook = function (headword, callback) {
        var alertLimit = 5;

        api.call('wordsbook/add', {
            word: headword
        }, function (res, validAccount) {

            if (res) {
                var remain = res.data.remain;

                if (remain == alertLimit) {
                    alert(lang.wordsbookCloseToLimit);
                }
                else if (remain == 0) {
                    alert(lang.wordsbookReachesLimit);
                }
                else if (remain < 0) {
                    alert(lang.wordsbookExceedsLimit);
                }
            }

            callback(validAccount, !!res);
        });
    };

    self.removeFromWordsbook = function (headword, callback) {
        api.call('wordsbook/remove', {
            word: headword
        }, function (res, validAccount) {
            callback(validAccount, !!res);
        });
    };

    function addResultMethods(result) {
        result.noResult = function (countSynonyms) {
            return !(
                    this.definitions && this.definitions.length ||
                    this.webDefinitions && this.webDefinitions.length ||
                    this.translation && this.translation.text && this.translation.text != this.query ||
                    countSynonyms && this.synonyms && this.synonyms.length
            );
        };
        result.onlyTranslation = function (countSynonyms) {
            return (
                this.translation && this.translation.text && this.translation.text != this.query &&
                !(
                    this.definitions && this.definitions.length ||
                    this.webDefinitions && this.webDefinitions.length ||
                    countSynonyms && this.synonyms && this.synonyms.length
                )
            );
        };
    }

    function fetchResult(phrase, callback) {
        var result = {
            error: false,
            query: phrase,
            wordsbookStatus: undefined,
            headword: undefined,
            phonetics: undefined,
            audio: undefined,
            tenses: undefined,
            synonyms: undefined,
            definitions: undefined,
            webDefinitions: undefined,
            translation: undefined,
            bingSearchUrl: "http://www.bing.com/search?q=" + encodeURIComponent(phrase)
        };

        var processes = {
            baiduTrans: {
                appID: "20160202000010644",
                secret: "GvS4zwkU_a7NNIM1wGZ_",
                getUrl: function(query) {
                    var salt = Date.now();
                    var sign = md5(this.appID + query + salt + this.secret);
                    return "http://api.fanyi.baidu.com/api/trans/vip/translate?from=auto&to=auto&q=" +
                        encodeURIComponent(query) +
                        "&appid=" + this.appID +
                        "&salt=" + salt +
                        "&sign=" + sign;
                },
                process: function (data, callback) {
                    var change = {
                        complete: false,
                        dependencies: [],
                        exec: function () {
                            result.translation = data ? {
                                text: data.trans_result[0].dst,
                                src: data.from,
                                to: data.to
                            } : undefined;
                        }
                    };

                    callback(change);
                }
            },
            bingDict: {
                getUrl: function(query) {
                    return "http://dict.bing.com.cn/api/http/v2/3A7B446E1F9244378B7141B73118977D/en-us/zh-cn/?format=application/json&q=" + encodeURIComponent(query);
                },
                process: function (data, callback) {
                    var change = {
                        complete: false,
                        dependencies: [],
                        exec: function () {
                            if (data && data.LEX) {
                                var lex = data.LEX;
                                var headword = lex.HW.V;
                                var sig = lex.HW.SIG;

                                result.phonetics = [];
                                result.audio = {};

                                var pron = lex.PRON;
                                var phonetic;

                                if (pron) {
                                    for (var i = 0; i < pron.length; i++) {
                                        if (pron[i].L == "PY") {
                                            result.phonetics.push({
                                                text: pron[i].V,
                                                poss: []
                                            });
                                        }
                                        else if (pron[i].L == "US"  && !result.phonetics.length) {
                                            result.phonetics.push({
                                                text: "/" + pron[i].V + "/",
                                                poss: []
                                            });
                                            result.audio.us = 'http://media.engkoo.com:8129/en-us/' + sig + '.mp3';
                                        }
                                    }
                                }

                                result.synonyms = extractSynonyms(lex.THES);

                                var allDefs = extractDefinitions(phrase, lex);
                                result.definitions = allDefs.definitions;
                                result.webDefinitions = allDefs.webDefinitions;

                                result.tenses = extractTenses(lex);

                                result.sentences = [];

                                if (result.definitions.length && data.SENT) {
                                    var st = data.SENT.ST || [];
                                    var length = Math.min(st.length, 5);

                                    for (var i = 0; i < st.length && i < length; i++) {
                                        var stItem = st[i];
                                        result.sentences.push({
                                            en: formatSentence(stItem.T.D),
                                            zh: formatSentence(stItem.S.D)
                                        });
                                    }
                                }
                            }

                            result.headword = {
                                text: headword,
                                beautified: headword
                            };

                            result.wordsbookStatus = /^[a-z]+(?:['-][a-z]+)?$/i.test(headword || '') ? 'querying' : undefined;
                        }
                    };

                    callback(change);
                }
            }
        };

        var pendingChanges = [];
        var pendingProcess = 0;

        var completed = false;

        function processCallback(newChange) {
            if (completed) {
                return;
            }

            pendingChanges.unshift(newChange);

            changes:
            for (var i = 0; i < pendingChanges.length; i++) {
                var change = pendingChanges[i];
                var dependencies = change.dependencies;

                for (var j = 0; j < dependencies.length; j++) {
                    var dependency = dependencies[j];
                    if (processes[dependency].ready) {
                        dependencies.splice(j--, 1);
                    }
                    else {
                        continue changes;
                    }
                }

                pendingChanges.splice(i--, 1);
                pendingProcess--;

                change.exec();
                callback(!pendingProcess || change.complete, result);

                //console.log("complete " + complete);

                if (change.complete) {
                    completed = true;
                    break;
                }
            }
        }

        for (var i in processes) {
            if (processes.hasOwnProperty(i)) {
                startProcess(processes[i]);
            }
        }

        function startProcess(process, name) {
            if (name) {
                processes[name] = process;
            }

            process.ready = false;
            cacheRequest(process.getUrl(phrase), function (text, done) {
                process.process(text, function (change) {
                    process.ready = true;
                    processCallback(change);
                });
            });
            pendingProcess++;
        }

        return result;

    }

    function extractSynonyms(items) {
        // from Bing

        var synonyms = [];

        if (!items) {
            return synonyms;
        }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.S && item.S.length) {
                synonyms.push({
                    pos: item.POS,
                    items: item.S
                });
            }
        }

        return synonyms;
    }

    function extractDefinitions(query, lex) {
        // from Bing
        if (!lex) {
            return {};
        }

        var definitions = [];
        var webDefinitions = [];
        var hash = definitions.hash = {};


        var cDef = lex.C_DEF;

        if (cDef) {
            var def = {
                lang: hasZh(query) ? "en" : "zh",
                poss: []
            };


            for (var i = 0; i < cDef.length; i++) {
                var cPos = cDef[i];

                var pos = {
                    pos: cPos.POS,
                    meanings: []
                };

                if (pos.pos == "web") {
                    var sen = cPos.SEN;
                    for (var j = 0; j < sen.length; j++) {
                        if (sen[j].D) {
                            webDefinitions.push({
                                text: sen[j].D,
                                url: sen[j].URL
                            });
                        }
                    }
                }
                else {
                    var sen = cPos.SEN;
                    for (var j = 0; j < sen.length; j++) {
                        pos.meanings.push(sen[j].D);
                    }
                    def.poss.push(pos);
                }
            }

            if (def.poss.length) {
                hash[def.lang] = true;
                definitions.push(def);
            }
        }

        var hDef = lex.H_DEF;

        if (hDef) {
            var def = {
                lang: hasZh(query) ? "zh" : "en",
                poss: []
            };

            hash[def.lang] = true;

            for (var i = 0; i < hDef.length; i++) {
                var hPos = hDef[i];

                var pos = {
                    pos: hPos.POS,
                    meanings: []
                };

                var sen = hPos.SEN;
                for (var j = 0; j < sen.length; j++) {
                    pos.meanings.push(sen[j].D);
                }
                def.poss.push(pos);
            }

            definitions.push(def);
        }

        return {
            definitions: definitions,
            webDefinitions: webDefinitions
        };
    }

    function extractTenses(lex) {
        var inf = lex.INF;

        if (inf) {
            var tenses = [];
            var tensesHash = {};
            var hOP = Object.prototype.hasOwnProperty;

            for (var i = 0; i < inf.length; i++) {
                var tenseData = inf[i];
                var text = tenseData.IE;
                var label = lang.tenses[tenseData.T] || tenseData.T;

                if (hOP.call(tensesHash, text)) {
                    var tense = tensesHash[text];
                    if (tense.labels.indexOf(label) < 0) {
                        tense.labels.push(label);
                    }
                }
                else {
                    var tense = {
                        text: text,
                        labels: [label]
                    };
                    tensesHash[text] = tense;
                    tenses.push(tense);
                }
            }
            return tenses;
        }
        else {
            return undefined;
        }
    }

    function formatSentence(text) {
        return text.replace(/\{#{1,2}\*(.+?)\*\${1,2}\}/g, '$1').replace(/\{(\d+)#(.+?)\$\1\}/g, '$2');
    }

    function hasZh(phrase) {
        return (phrase.match(/[\u4e00-\u9fa5]/g) || []).length;
    }

    function decodeHtml(html) {
        var temp = document.createElement("div");
        temp.innerHTML = html;
        return temp.innerText;
    }
})();

function cacheRequest(url, callback, key) {
    key = "requestCache." + (key || "default") + "." + url;
    chrome.storage.local.get(key, function (items) {
        var item = items[key];
        if (item && item.time + settings.cacheTimeout * 24 * 3600 * 1000 > new Date().getTime()) {
            callback(item.data, true);
        }
        else {
            chrome.runtime.sendMessage({
                type: 'request',
                url: url
            }, function (result) {
                var data = result.data;
                if (result.success) {
                    items[key] = {
                        time: new Date().getTime(),
                        data: data
                    };

                    chrome.storage.local.set(items);
                }

                callback(data, result.success);
            });
        }
    });

}

function hasZh(phrase) {
    return (phrase.match(/[\u4e00-\u9fa5]/g) || []).length;
}

function hasSpace(phrase) {
    return (phrase.match(/\s+/g) || []).length;
}

function doubleEncode(str) {
    return str ? encodeURIComponent(encodeURIComponent(str)) : "";
}

function doubleDecode(str) {
    return str ? decodeURIComponent(decodeURIComponent(str)) : "";
}

function encodeHtml(text) {
    var temp = document.createElement("div");
    temp.innerText = text;
    return temp.innerHTML;
}

function decodeHtml(html) {
    var temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.innerText;
}
