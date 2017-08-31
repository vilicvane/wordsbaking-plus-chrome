var MainController = ['$scope', '$sce', function ($scope, $sce) {
    $scope.lang = lang;

    lang.options.accountDescriptionHtml = $sce.trustAsHtml(lang.options.accountDescriptionHtml);
    lang.options.baiduTranslationAPIDescriptionHtml = $sce.trustAsHtml(lang.options.baiduTranslationAPIDescriptionHtml);
    lang.options.pageTitleHtml = $sce.trustAsHtml(lang.options.pageTitleHtml);

    $scope.options = undefined;

    $scope.$watch("options", function (options) {
        //console.log("write options: ", options);
        if (options) {
            chrome.storage.sync.set({
                options: options
            });
        }
    }, true);

    var apiBaseUrl = 'https://api.wordsbaking.com/';

    $(function () {
        var status = $('#account-status')[0];

        var button = $('#check-account-button').click(function () {
            var email = $scope.options.email;
            var password = $scope.options.password;

            if (!email || !password) {
                status.className = '';
                return;
            }

            var that = this;
            this.disabled = true;
            this.innerText = lang.options.checkingAccount;

            status.className = 'checking';

            $.post(apiBaseUrl + 'user/check', {
                email: $scope.options.email,
                password: $scope.options.password
            }).done(function (res) {
                if (res.error) {
                    if (res.error > 2000 && res.error < 3000) {
                        // auth error
                        status.className = 'invalid';
                    }
                    else {
                        status.className = '';
                    }
                }
                else {
                    status.className = 'valid';
                }
            }).fail(function () {
                status.className = '';
            }).always(function () {
                that.disabled = false;
                that.innerText = lang.options.checkAccount;
            });

        });

        chrome.storage.sync.get("options", function (items) {
            //console.log("read options: ", items.options);
            $scope.options =
                items.options || {
                    autoAudio: true,
                    popupCtrlKey: true,
                    popupDblClick: true,
                    popupSelect: false,
                    email: undefined,
                    password: undefined
                };
            $scope.$apply();

            if ($scope.options.email && $scope.options.password) {
                button.click();
            }
        });
    });
}];