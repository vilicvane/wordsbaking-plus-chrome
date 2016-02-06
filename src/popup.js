$(function () {
    var input = $("#phrase-input").mousedown(function (e) {
        if (document.activeElement != this) {
            e.preventDefault();
            this.focus();
        }
    }).focus(function () {
        this.select();
    }).focus().get(0);
    
    document.addEventListener("keydown", function (e) {
        if (document.activeElement == input) {
            return;
        }

        if (e.keyCode == 13 && document.activeElement != $("#define-button").get(0)) {
            input.focus();
        }
        else if (e.keyCode == 189) {
            history.go(-1);
            e.preventDefault();
        }
        else if (e.keyCode == 187){
            history.go(1);
            e.preventDefault();
        }
        else if (e.keyCode == 8) {
            input.focus();
            var length = input.value.length;
            input.setSelectionRange(length, length);
        }
        else if (!e.altKey && !e.ctrlKey && !e.metaKey || e.keyCode == 86) {
            input.focus();
        }
    }, true);
});

var MainController = [
    '$scope', '$location', '$route', '$routeParams', '$locale',
    function ($scope, $location, $route, $routeParams, $locale) {

        $scope.$routeParams = $routeParams;
        $scope.$location = $location;

        var Status =
        $scope.Status = {
            init: 0,
            loading: 1,
            ready: 2,
            nothing: 3,
            error: 4
        };

        $scope.status = Status.init;

        $scope.lang = lang;
        $scope.settings = settings;

        $scope.result = null;

        var audio;
        $scope.$watch("result.audio.us", function (value) {
            audio = value ? new Audio(value) : null;
        });

        $scope.playAudio = function () {
            setTimeout(function () {
                if (audio) {
                    audio.src = audio.src;
                    audio.play();
                }
            }, 0);
        };

        $scope.define = function () {
            var path = "/" + doubleEncode($.trim($scope.phrase));
            if (path != $location.path()) {
                $location.path(path);
            }
            else {
                routeChange();
            }
        };

        function openOptionsPage() {
            window.open(chrome.extension.getURL('options.html'));
        }

        $(document).delegate(".word-true", "click", function () {
            $scope.phrase = $(this).text();
            $scope.define();
            $scope.$apply();
        }).delegate('#headword-wrapper.wb-addable .wordsbook-button', 'click', function () {
            var result = $scope.result;
            result.wordsbookStatus = 'adding';
            $scope.$apply();
            addToWordsbook(result.headword.text, function (accountReady, done) {
                result.wordsbookStatus = accountReady ? done ? 'added' : 'addable' : 'setup';
                $scope.$apply();

                if (!accountReady) {
                    openOptionsPage();
                }
            });
        }).delegate('#headword-wrapper.wb-added .wordsbook-button', 'click', function () {
            var result = $scope.result;
            result.wordsbookStatus = 'removing';
            $scope.$apply();
            removeFromWordsbook(result.headword.text, function (accountReady, done) {
                result.wordsbookStatus = accountReady ? done ? 'addable' : 'added' : 'setup';
                $scope.$apply();

                if (!accountReady) {
                    openOptionsPage();
                }
            });
        }).delegate('#headword-wrapper.wb-setup .wordsbook-button', 'click', function () {
            openOptionsPage();
        });

        $scope.$on("$routeChangeSuccess", routeChange);

        function routeChange() {
            $scope.phrase = doubleDecode($routeParams.phrase);
            define();
        }

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            try {
                chrome.tabs.sendMessage(tabs[0].id, { type: "getSelection" }, function (data) {
                    if (data) {
                        $scope.phrase = data.text;
                        $scope.define();
                        $scope.$apply();
                    }
                });
            } catch (e) { }
        });

        var lastPhrase;

        function define() {
            $("#definition-wrapper").scrollTop(0);
            $("#phrase-input").blur();

            var phrase = $scope.phrase;
            lastPhrase = phrase;

            if (!phrase) {
                $scope.status = Status.init;
                return;
            }

            $scope.status = Status.loading;
            $scope.result = null;

            fetchResult(phrase, function (complete, result) {
                if (phrase != lastPhrase) {
                    return;
                }

                addResultMethods(result);

                if (result.wordsbookStatus) {
                    wordsbookExists(result.headword.text, function (accountReady, exists) {
                        result.wordsbookStatus = accountReady ? exists ? 'added' : 'addable' : 'setup';
                        $scope.$apply();
                    });
                }

                $scope.result = result;

                if (complete) {
                    $scope.status =
                        result.noResult(true) ?
                            Status.nothing :
                            result.error ? Status.error : Status.ready;

                    if (options.autoAudio) {
                        $scope.playAudio();
                    }
                }

                $scope.$apply();
            });

        }

    }
];

angular.module("popup", ["ngRoute"], ['$routeProvider', function ($routeProvider) {
    $routeProvider.when("/", {
        controller: MainController
    }).when("/:phrase", {
        controller: MainController
    });
}]).directive("clickableWords", function () {
    return function (scope, ele, attrs) {
        scope.$watch(attrs.clickableWords, function (value) {
            if (typeof value == "string") {
                var html = splitWords(value, 'word', true);
                ele.html(html);
            }
        });
    };
});