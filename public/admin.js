define('admin/plugins/sso-wechat', ['settings'], function(Settings) {
    'use strict';
    /* globals $, app, socket, require */

    var ACP = {};

    ACP.init = function() {
        Settings.load('sso-wechat', $('.sso-wechat-settings'));

        $('#save').on('click', function() {
            Settings.save('sso-wechat', $('.sso-wechat-settings'), function() {
                app.alert({
                    type: 'success',
                    alert_id: 'sso-wechat-saved',
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
