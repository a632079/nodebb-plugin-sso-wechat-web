'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportWechat = require('passport-wechat').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async');

//var constants = module.parent.require('../plugin_configs/sso_wechat_constants');
var constants = Object.freeze({
  'name': "Wechat2",
  'admin': {
    'icon': 'fa-weixin',
    'route': '/plugins/sso-wechat2'
  }
});

var Wechat = {};

Wechat.getStrategy = function(strategies, callback) {
  meta.settings.get('sso-wechat2', function(err, settings) {
    if (!err && settings.id && settings.secret) {
      passport.use(new passportWechat({
        appID: settings.id,
        appSecret: settings.secret,
        client: settings.weclient ? 'wechat' : 'website',
        scope: "snsapi_userinfo",
        callbackURL: nconf.get('url') + '/auth/wechat/callback'
      }, function(accessToken, refreshToken, profile, done) {
        Wechat.login(profile.id, profile.displayName, function(err, user) {
          if (err) {
            return done(err);
          }
          done(null, user);
        });
      }));

      strategies.push({
        name: 'wechat',
        url: '/auth/wechat',
        callbackURL: '/auth/wechat/callback',
        icon: 'fa-weixin',
        scope: ''
      });
    }
    callback(null, strategies);
  });
};

Wechat.getAssociation = function(data, callback) {
  User.getUserField(data.uid, 'wxid', function(err, wxid) {
    if (err) {
      return callback(err, data);
    }

    if (wxid) {
      data.associations.push({
        associated: true,
        name: constants.name,
        icon: constants.admin.icon
      });
    } else {
      data.associations.push({
        associated: false,
        url: nconf.get('url') + '/auth/wechat',
        name: constants.name,
        icon: constants.admin.icon
      });
    }

    callback(null, data);
  })
};

Wechat.addMenuItem = function(custom_header, callback) {
  custom_header.authentication.push({
    "route": constants.admin.route,
    "icon": constants.admin.icon,
    "name": constants.name
  });

  callback(null, custom_header);
};

Wechat.login = function(wxid, handle, callback) {
  Wechat.getUidByWechatId(wxid, function(err, uid) {
    if (err) {
      return callback(err);
    }

    if (uid !== null) {
      // Existing User
      callback(null, {
        uid: uid
      });
    } else {
      // New User
      user.create({
        username: handle
      }, function(err, uid) {
        if (err) {
          return callback(err);
        }

        // Save wechat-specific information to the user
        user.setUserField(uid, 'wxid', wxid);
        db.setObjectField('wxid:uid', wxid, uid);

        callback(null, {
          uid: uid
        });
      });
    }
  });
};

Wechat.getUidByWechatId = function(wxid, callback) {
  db.getObjectField('wxid:uid', wxid, function(err, uid) {
    if (err) {
      return callback(err);
    }
    callback(null, uid);
  });
};

Wechat.deleteUserData = function(uid, callback) {
  async.waterfall([
    async.apply(user.getUserField, uid, 'wxid'),
    function(oAuthIdToDelete, next) {
      db.deleteObjectField('wxid:uid', oAuthIdToDelete, next);
    }
  ], function(err) {
    if (err) {
      winston.error('[sso-wechat] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
      return callback(err);
    }
    callback(null, uid);
  });
};

Wechat.init = function(data, callback) {
  function renderAdmin(req, res) {
    res.render('admin/plugins/sso-wechat2', {
      callbackURL: nconf.get('url') + '/auth/wechat/callback'
    });
  }

  data.router.get('/admin/plugins/sso-wechat2', data.middleware.admin.buildHeader, renderAdmin);
  data.router.get('/api/admin/plugins/sso-wechat2', renderAdmin);

  callback();
};

module.exports = Wechat;
