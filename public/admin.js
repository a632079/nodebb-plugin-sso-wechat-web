define('admin/plugins/sso-wechat2', ['settings'], function(Settings) {
    'use strict';
    /* globals $, app, socket, require */

    var ACP = {};

    ACP.init = function() {
        Settings.load('sso-wechat2', $('.sso-wechat2-settings'));

        $('#save').on('click', function() {
            Settings.save('sso-wechat2', $('.sso-wechat2-settings'), function() {
                app.alert({
                    type: 'success',
                    alert_id: 'sso-wechat2-saved',
                    title: 'Settings Saved',
                    message: 'Please reload your NodeBB to apply these settings',
                    clickfn: function() {
                        socket.emit('admin.reload');
                    }
                });
            });
        });
    };

    return ACP;
});
