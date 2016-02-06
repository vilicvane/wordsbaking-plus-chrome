(function () {
    var hasOwnProperty = Object.prototype.hasOwnProperty;

    chrome.runtime.onMessage.addListener(function (message, sender, callback) {
        switch (message.type) {
            case "getSelection":
                var text = popup.getCurrentQuery() || getSelection().toString().trim();
                // the reason to determine whether selection is empty in content script
                // is that there might be several iframes containing content script, and
                // it seems that the callback works only once.
                if (text) {
                    callback({
                        text: text
                    });
                }

                popup.hide();
                break;
            default:
                break;
        }
    });

    var popup = new Popup();

    var cancelDblClick = false;

    $(document).dblclick(function () {
        if (!cancelDblClick && options.popupDblClick) {
            showPopup();
        }
    }).click(function () {
        popup.hide();
    }).contextmenu(function () {
        popup.hide();
    }).mouseup(function (e) {
        if (options.popupCtrlKey && (e.ctrlKey || e.metaKey) || options.popupSelect) {
            cancelDblClick = true;
            // seems that this timer is to prevent the click event hide the popup
            setTimeout(function () {
                cancelDblClick = false;
                showPopup();
            }, 0);
        }
    });

    function showPopup() {
        var selection = getSelection();
        var text = selection.toString().trim();

        if (!text) {
            return;
        }

        popup.show(text, selection.getRangeAt(0));
    }

    function Popup() {
        var that = this;

        var eleQ = $(
            '<div id="wbp-popup">' +
                '<div id="wbp-loading">' + lang.loading + '...</div>' +
                '<div id="wbp-loaded">' +
                    '<div id="wbp-headword-wrapper">' +
                        '<span id="wbp-headword"></span>' +
                        '<span id="wbp-pos"></span>' +
                        '<span id="wbp-wordsbook-button"></span>' +
                    '</div>' +
                    '<div id="wbp-phonetic-wrapper">' +
                        '<span id="wbp-phonetic"></span>' +
                        '<span id="wbp-audio"></span>' +
                    '</div>' +
                    '<div id="wbp-definitions"></div>' +
                    '<div id="wbp-translation"></div>' +
                '</div>' +
                '<div id="wbp-popup-arrow"><div><div></div></div></div>' +
                '<div id="wbp-close" title="' + lang.close + '"></div>' +
            '</div>'
        );

        var ele = eleQ[0];

        var loadingEle = eleQ.find('#wbp-loading')[0];
        var loadedEle = eleQ.find('#wbp-loaded')[0];
        var arrowEle = eleQ.find('#wbp-popup-arrow')[0];

        eleQ.find('#wbp-close').click(function () {
            hide();
        });

        var headwordWrapper = eleQ.find('#wbp-headword-wrapper')[0];

        var headwordEle = eleQ.find('#wbp-headword')[0];
        var posEle = eleQ.find('#wbp-pos')[0];

        var phoneticWrapper = eleQ.find('#wbp-phonetic-wrapper')[0];
        var phoneticEle = eleQ.find('#wbp-phonetic')[0];
        var audioEle = eleQ.find('#wbp-audio')[0];

        var wordsbookEle = eleQ.find('#wbp-wordsbook-button')[0];

        var definitionsEle = eleQ.find('#wbp-definitions')[0];
        var translationEle = eleQ.find('#wbp-translation')[0];

        var showing;

        var lastRange;

        var lastPhrase;
        var lastResult;

        var history = new function () {
            var list = [];
            var index = -1;

            this.add = function (phrase) {
                if (list[index] == phrase) {
                    return;
                }

                index++;
                if (index < list.length) {
                    list.length = index;
                }
                list.push(phrase);
            };

            this.previous = function () {
                if (index > 0) {
                    index--;
                    return list[index];
                }
                else {
                    return undefined;
                }
            };

            this.next = function () {
                if (index < list.length - 1) {
                    index++;
                    return list[index];
                }
                else {
                    return undefined;
                }
            };
        }();

        eleQ.click(function (e) {
            e.stopPropagation();
        }).contextmenu(function (e) {
            e.stopPropagation();
        }).dblclick(function (e) {
            var text = getSelection().toString().trim();
            if (text) {
                that.show(text, lastRange);
            }
            e.stopPropagation();
        }).delegate('.wbp-word-true', 'click', function () {
            that.show($(this).text(), lastRange);
        })

        $(audioEle).click(function () {
            new Audio($(this).attr("data-audio")).play();
        });

        $(wordsbookEle).click(function () {
            var result = lastResult;
            var headword = result.headword.text;

            if (headwordWrapper.className == 'wbp-wb-addable') {
                headwordWrapper.className = 'wbp-wb-adding';
                headwordWrapper.title = '';

                addToWordsbook(headword, function (accountReady, done) {
                    if (!accountReady) {
                        openOptionsPage();
                        return;
                    }

                    if (result == lastResult) {
                        headwordWrapper.className = done ? 'wbp-wb-added' : 'wbp-wb-addable';
                        headwordWrapper.title = done ? lang.removeFromWordsbook : lang.addToWordsbook;
                    }
                });
            }
            else if (headwordWrapper.className == 'wbp-wb-added') {
                headwordWrapper.className = 'wbp-wb-removing';
                headwordWrapper.title = '';

                removeFromWordsbook(headword, function (accountReady, done) {
                    if (!accountReady) {
                        openOptionsPage();
                        return;
                    }

                    if (result == lastResult) {
                        headwordWrapper.className = done ? 'wbp-wb-addable' : 'wbp-wb-added';
                        headwordWrapper.title = done ? lang.addToWordsbook : lang.removeFromWordsbook;
                    }
                });
            }
            else if (headwordWrapper.className == 'wbp-wb-setup') {
                openOptionsPage();
            }
        });

        $(window).resize(function () {
            if (showing) {
                preAdjust();
            }
        }).scroll(function () {
            if (showing) {
                preAdjust();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!showing) {
                return;
            }

            var phrase;

            if (e.keyCode == 189) {
                phrase = history.previous();
            }
            else if (e.keyCode == 187) {
                phrase = history.next();
            }

            if (!phrase) {
                return;
            }

            that.show(phrase, lastRange);

            e.stopPropagation();
        });

        function openOptionsPage() {
            window.open(chrome.extension.getURL('options.html'));
            hide();
        }

        function preAdjust() {
            var rect = lastRange.getBoundingClientRect();

            if (rect.width) {
                adjustPosition(rect);
                return true;
            }
            else if (getSelection().toString()) {
                hide();
                return false;
            }
        }

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

        this.getCurrentQuery = function () {
            return showing ? lastPhrase : undefined;
        };

        this.show = function (text, range) {
            document.body.appendChild(ele);
            showing = true;
            lastRange = range;
            lastPhrase = text;

            displayBlock(loadingEle);
            displayNone(loadedEle);

            if (!preAdjust()) {
                return;
            }

            history.add(text);

            fetchResult(text, function (complete, result) {
                if (!complete || text != lastPhrase) {
                    return;
                }

                lastResult = result;

                addResultMethods(result);

                displayNone(loadingEle);
                displayBlock(loadedEle);

                if (result.headword && !result.noResult(false) && !result.onlyTranslation(false)) {
                    headwordEle.innerText = result.headword.beautified;
                    displayBlock(headwordWrapper);

                    if (!result.wordsbookStatus) {
                        displayNone(wordsbookEle);
                    }
                    else {
                        displayBlock(wordsbookEle, true);
                        headwordWrapper.className = 'wbp-wb-querying';

                        wordsbookExists(result.headword.text, function (accountReady, exists) {
                            if (result != lastResult) {
                                return;
                            }

                            if (accountReady) {
                                headwordWrapper.className = exists ? 'wbp-wb-added' : 'wbp-wb-addable';
                                headwordWrapper.title = exists ? lang.removeFromWordsbook : lang.addToWordsbook;
                            }
                            else {
                                headwordWrapper.className = 'wbp-wb-setup';
                                headwordWrapper.title = lang.setupAccount;
                            }
                        });

                    }

                    var definitions = result.definitions;

                    var posCount;
                    var pos;
                    var otherPoss = [];
                    var meanings = [];

                    if (definitions.length) {
                        if (definitions.length == 1) {
                            var poss = definitions[0].poss;
                            var max = 0;
                            posCount = poss.length;
                            for (var i = 0; i < posCount; i++) {
                                if (poss[i].meanings.length > max) {
                                    pos = poss[i];
                                    max = pos.meanings.length;
                                }
                            }
                            meanings.push(splitWords(pos.meanings[0], 'wbp-word'));
                            for (var i = 0; i < posCount; i++) {
                                if (poss[i] != pos) {
                                    otherPoss.push(poss[i].pos);
                                }
                            }
                        }
                        else {
                            var posHash = {};
                            var poss = definitions[0].poss;
                            var max = 0;
                            posCount = poss.length;

                            for (var i = 0; i < posCount; i++) {
                                posHash[poss[i].pos] = poss[i];
                            }

                            var poss2 = definitions[1].poss;
                            var pos2;
                            for (var i = 0; i < poss2.length; i++) {
                                if (posHash.hasOwnProperty(poss2[i].pos)) {
                                    if (posHash[poss2[i].pos].meanings.length > max) {
                                        pos2 = poss2[i];
                                        pos = posHash[pos2.pos];
                                        max = pos.meanings.length;
                                    }
                                }
                            }

                            if (pos) {
                                meanings.push(splitWords(pos.meanings[0], 'wbp-word'));
                                meanings.push(splitWords(pos2.meanings[0], 'wbp-word'));
                            }
                            else {
                                pos = poss[0];
                                meanings.push(splitWords(pos.meanings[0], 'wbp-word'));
                            }

                            for (var i = 0; i < posCount; i++) {
                                if (poss[i] != pos) {
                                    otherPoss.push(poss[i].pos);
                                }
                            }
                        }

                        posEle.innerHTML = pos.pos + (posCount > 1 ? "<span>+" + (posCount - 1) + "</span>" : "");
                        otherPoss.unshift(pos.pos);
                        posEle.title = otherPoss.join(", ");
                        displayBlock(posEle, true);
                        wordsbookEle.className = '';
                    }
                    else {
                        displayNone(posEle);
                        wordsbookEle.className = 'alone';

                        //console.log(result.webDefinitions);

                        if (result.webDefinitions.length) {
                            var item = result.webDefinitions[0];
                            meanings.push(splitWords(item.text, 'wbp-word'));
                            meanings.push('<a href="' + encodeHtml(item.url) + '" target="_blank">' + encodeHtml(item.url) + '</a>');
                        }
                    }

                    var defHtml = "";

                    for (var i = 0; i < meanings.length; i++) {
                        defHtml += "<div>" + meanings[i] + "</div>";
                    }

                    definitionsEle.innerHTML = defHtml;

                    displayNone(translationEle);
                    displayBlock(definitionsEle);
                }
                else {
                    displayNone(headwordWrapper);
                    displayNone(wordsbookEle);
                    displayNone(definitionsEle);

                    displayBlock(translationEle);

                    translationEle.innerHTML = splitWords(
                        result.translation ?
                            result.translation.text :
                            text
                    );
                }

                if (result.phonetics && result.phonetics.length) {
                    phoneticEle.innerText = result.phonetics[0].text;

                    if (result.audio.us) {
                        displayBlock(audioEle, true);
                        audioEle.setAttribute("data-audio", result.audio.us);
                        var audio = new Audio(result.audio.us);
                        if (options.autoAudio) {
                            audio.play();
                        }
                    }
                    else {
                        displayNone(audioEle);
                    }

                    displayBlock(phoneticWrapper, true);
                }
                else {
                    displayNone(phoneticWrapper);
                }

                preAdjust();
            });

            function encodeHtml(text) {
                var temp = document.createElement("div");
                temp.innerText = text;
                return temp.innerHTML;
            }

            function displayBlock(ele, inline) {
                ele.style.cssText = inline ? "display: inline-block!important;" : "display: block!important;";
            }

            function displayNone(ele) {
                ele.style.cssText = "display: none!important;";
            }
        };

        function adjustPosition(selectionRect) {
            ele.style.cssText = "";

            var sw = selectionRect.width;
            var sh = selectionRect.height;

            var sx = selectionRect.left;
            var sy = selectionRect.top;

            var w = ele.offsetWidth;
            var h = ele.offsetHeight;

            var dx = self.pageXOffset;
            var dy = self.pageYOffset;

            var body = document.body;
            var doc = document.documentElement;

            var vw = Math.min(body.clientWidth, doc.clientWidth);
            var vh = Math.min(body.clientHeight, doc.clientHeight);

            var margin = 10;

            // y-axis
            var marginY = 12;

            var top = dy + sy - marginY - h;
            ele.className = "above";

            if (top - margin < dy) {
                top = dy + sy + sh + marginY;
                ele.className = "below";
            }

            // x-axis
            var left = sx + sw / 2 - w / 2;
            var arrowLeft = w / 2;
            var arrowMinDiff = 20;

            if (left - margin < dx) {
                left = dx + margin;
                arrowLeft = Math.max(arrowMinDiff, sx + sw / 2 - left);
            }
            else if (left + w + margin > dx + vw) {
                left = dx + vw - w - margin;
                arrowLeft = Math.min(w - arrowMinDiff, sx + sw / 2 - left);
            }

            ele.style.cssText = "top: " + top + "px!important; left: " + left + "px!important";
            arrowEle.style.cssText = "left: " + arrowLeft + "px!important";
        }

        var hide =
        this.hide = function () {
            if (ele.parentNode) {
                ele.parentNode.removeChild(ele);
            }

            showing = false;
        };
    }
})();
