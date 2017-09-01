(function () {
    var posDict = {
        '名词': 'n.',
        '动词': 'v.',
        '形容词': 'adj.',
        '副词': 'adv.',
        '介词': 'prep.',
        '连词': 'conj.'
    };

    var definitionTypeSet = {
        '快速释义': true,
        '汉英': true,
        '英汉': true,
        '英英': true
    };

    var langDict = {
        '汉英': 'en',
        '英汉': 'zh',
        '英英': 'en'
    };

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
                disabled: (options.baiduTranslationAppID &&  options.baiduTranslationAppSecretKey),
                appID: options.baiduTranslationAppID,
                secret: options.baiduTranslationAppSecretKey,
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
                            result.translation = data && data.trans_result ? {
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
                    return "https://www.bing.com/api/v6/dictionarywords/search?q="+encodeURIComponent(query)+"&appid=371E7B2AF0F9B84EC491D731DF90A55719C7D209&mkt=zh-cn&pname=bingdict&dtype=lex";
                },
                process: function (data, callback) {
                    var change = {
                        complete: false,
                        dependencies: [],
                        exec: function () {
                            var headword = '';

                            if (data && data.value && data.value.length) {
                                var firstDataValue = data.value[0];
                                var meaningGroups = firstDataValue.meaningGroups;
                                var pronunciationAudioUrl = firstDataValue.pronunciationAudio.contentUrl;
                                headword = firstDataValue.name;

                                var pronunciations = extractPronunciations(meaningGroups);

                                result.phonetics = [];
                                result.audio = {};

                                for (var i = 0; i < pronunciations.length; i++) {
                                    var pronunciation = pronunciations[i];

                                    if (pronunciation.type === 'PY') {
                                        result.phonetics.push({
                                            text: pronunciation.pron,
                                            poss: []
                                        });
                                    } else {
                                        result.phonetics.push({
                                            text: "/" + pronunciation.pron + "/",
                                            poss: []
                                        });

                                        result.audio.us = pronunciationAudioUrl;
                                    }
                                }

                                var allDefs = extractDefinitions(phrase, meaningGroups);
                                result.definitions = allDefs.definitions;
                                result.webDefinitions = allDefs.webDefinitions;
                                result.tenses = extractTenses(meaningGroups);
                                result.synonyms = extractSynonyms(meaningGroups);
                                result.sentences = extractSentences(meaningGroups);
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
            if (process.disabled) {
                return;
            }

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

    function extractPronunciations(meaningGroups) {
        var pronunciations = [];

        if (!meaningGroups) {
            return pronunciations;
        }

        var set = {};

        for (var i = 0; i < meaningGroups.length; i++) {
            var meaningGroup = meaningGroups[i];
            var firstSpeech = meaningGroup.partsOfSpeech[0];
            var firstMeaning = meaningGroup.meanings[0];

            if (!firstMeaning || !firstSpeech || set.hasOwnProperty(firstSpeech.name)) {
                continue;
            }

            switch (firstSpeech.name) {
                case 'US':
                case 'PY':
                    set[firstSpeech.name] = true;
                    pronunciations.push({ type: firstSpeech.name, pron: firstMeaning.richDefinitions[0].fragments[0].text});
                    break;
            }
        }

        return pronunciations;
    }

    function extractSynonyms(meaningGroups) {
        // from Bing

        var synonyms = [];

        if (!meaningGroups) {
            return synonyms;
        }

        for (var i = 0; i < meaningGroups.length; i++) {
            var meaningGroup = meaningGroups[i];
            var firstMeaning = meaningGroup.meanings[0];

            if (firstMeaning && firstMeaning.synonyms) {
                synonyms.push({
                    pos: 'ALL',
                    items:  firstMeaning.synonyms.map(item => item.name)
                });
                break;
            }
        }

        return synonyms;
    }

    function extractDefinitions(query, meaningGroups) {
        // from Bing

        var definitions = [];
        var webDefinitions = [];
        var chineseDefinitions = { lang: 'zh', poss: [] };
        var englishDefinitions = { lang: 'en', poss: [] };
        var posMap = { zh: {}, en: {} };

        if (!meaningGroups) {
            return definitions;
        }

        for (var i = 0; i < meaningGroups.length; i++) {
            var meaningGroup = meaningGroups[i];
            var firstSpeech = meaningGroup.partsOfSpeech[0];
            var firstMeaning = meaningGroup.meanings[0];
            var description = firstSpeech.description;

            if (definitionTypeSet.hasOwnProperty(description)) {
                var lang = langDict[description];
                switch (firstSpeech.name) {
                    case '网络':
                        if (description === '快速释义') {
                            break;
                        }

                        var richDefinitions = firstMeaning.richDefinitions;

                        for (var rI = 0; rI < richDefinitions.length; rI++) {
                            var definition = richDefinitions[rI];

                            webDefinitions.push({
                                url: definition.examples[0],
                                text: definition.fragments[0].text
                            });
                        }
                    break;
                    default:
                        if (!lang) {
                            lang = hasZh(firstMeaning.richDefinitions[0].fragments[0].text) ? 'zh' : 'cn';
                        }

                        var targetDefinitions = lang === 'zh' ? chineseDefinitions : englishDefinitions;
                        var targetPosMap = lang === 'zh' ? posMap.zh : posMap.en;
                        var pos = posDict[firstSpeech.name] || firstSpeech.name;
                        var meanings = targetPosMap[pos];

                        if (!meanings) {
                            meanings = targetPosMap[pos] = [];
                            targetDefinitions.poss.push({ pos: pos, meanings: meanings })
                        }

                        meanings.push.apply(meanings, extractFragmentsText(firstMeaning.richDefinitions[0].fragments))
                        break;
                }
            }
        }

        if (hasZh(query)) {
            if (englishDefinitions.poss.length) {
                definitions.push(englishDefinitions);
            }

            if (chineseDefinitions.poss.length) {
                definitions.push(chineseDefinitions);
            }

        } else {
            if (chineseDefinitions.poss.length) {
                definitions.push(chineseDefinitions);
            }

            if (englishDefinitions.poss.length) {
                definitions.push(englishDefinitions);
            }
        }

        for (var i = 0; i < definitions.length; i++) {
            adjustmentDefinitionPosResult(definitions[i].poss);
        }

        return {
            definitions: definitions,
            webDefinitions: webDefinitions
        };
    }

    function extractFragmentsText(fragments) {
        var texts = [];

        for (var i = 0; i < fragments.length; i++) {
            texts.push(fragments[i].text);
        }

        return texts;
    }

    function extractTenses(meaningGroups) {
        // from Bing

        var tenses = [];
        if (!meaningGroups) {
            return tenses;
        }

        for (var i = 0; i < meaningGroups.length; i++) {
            var meaningGroup = meaningGroups[i];
            var firstMeaning = meaningGroup.meanings[0];
            var firstSpeech = meaningGroup.partsOfSpeech[0];

            if (firstSpeech.name === '变形') {
                tenses = firstMeaning.richDefinitions[0].fragments;

                break;
            }
        }

        for (var i = 0; i < tenses.length; i++) {
            var tense = tenses[i].text.split('：');
            tenses[i].labels = [tense[0]];
            tenses[i].text = tense[1];
        }

        return tenses;
    }

    function extractSentences(meaningGroups) {
        // from Bing

        var sentences = [];

        if (!meaningGroups) {
            return sentences;
        }

        for (var i = 0; i < meaningGroups.length; i++) {
            var meaningGroup = meaningGroups[i];
            var firstMeaning = meaningGroup.meanings[0];
            var firstSpeech = meaningGroup.partsOfSpeech[0];

            if (firstSpeech.name === '网络') {
                continue;
            }

            var richDefinitions = firstMeaning.richDefinitions;

            for (var rI = 0; rI < richDefinitions.length; rI++) {
                var definition = richDefinitions[rI];

                if (!definition.examples || definition.examples.length !== 2) {
                    continue;
                }

                sentences.push({
                    en: definition.examples[0],
                    zh: definition.examples[1]
                });
            }
        }

        return sentences;
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
    chrome.storage.local.clear();
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
    return temp.innerHTML.replace(/&nbsp;/g, ' ');
}

function decodeHtml(html) {
    var temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.innerText;
}

function adjustmentDefinitionPosResult(poss) {
    for (var i = 0; i < poss.length; i++) {
        var pos = poss[i];
        duplicateRemovalMeaning(pos.meanings);
    }

    return poss;
}

function duplicateRemovalMeaning(meanings) {
    var meaningSet = {};
    var n = 0;

    outerLoop:
    for (var i = 0; i < meanings.length; i++) {
        var meaning = meanings[i];

        if (meaningSet.hasOwnProperty(meaning)) {
            continue;
        }

        for (var j = 0; j < n; j++) {
            var stashMeaning = meanings[j];

            if (stashMeaning.indexOf(meaning) > -1 || meaning.indexOf(stashMeaning) > -1) {
                continue outerLoop;
            }
        }

        meanings[n++] = meaning;
        meaningSet[meaning] = true;
    }

    meanings.length = n;

    return meanings;
}
