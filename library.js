'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportWechat = require('passport-weixin').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async');
var constants = Object.freeze({
  'name': "微信",
  'admin': {
    'icon': 'fa-weixin',
    'route': '/plugins/sso-wechat'
  }
});

var Wechat = {};

Wechat.getStrategy = function (strategies, callback) {
  meta.settings.get('sso-wechat', function (err, settings) {
    if (!err && settings.id && settings.secret) {
      passport.use("wechat", new passportWechat({
        clientID: settings.id,
        clientSecret: settings.secret,
        callbackURL: nconf.get('url') + '/auth/wechat/callback',
        requireState: false,
        scope: 'snsapi_login',
        passReqToCallback: true
      }, function (req, accessToken, refreshToken, profile, done) {
        if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
          //如果用户想重复绑定的话，我们就拒绝他。
          QQ.hasWeChatId(profile.id, function (err, res) {
            if (err) {
              winston.error(err);
              if (res) {
                return done("You have binded a WeChat account.If you want to bind another one ,please unbind your account.", flase);
              } else {

                // Save wechat-specific information to the user
                console.log("[SSO-WeChat]User is logged.Binding.");
                console.log("[SSO-WeChat]req.user:");
                console.log(req.user);
                User.setUserField(req.user.uid, 'wxid', profile.id);
                db.setObjectField('wxid:uid', profile.id, req.user.uid);
                console.log(`[SSO-WeChat] ${req.user.uid} is binded.`);

                //Set Picture
                db.setObjectField('uid:wxpic',req.user.uid,profile.profileUrl);
                return done(null, req.user);
              }
            }
          });
        }
        QQ.hasWeChatId(profile.id, function (err, res) {
          if (err) {
            winston.error(err);
            if (res) {
              return done("You have binded a WeChat account.If you want to bind another one ,please unbind your account.", flase);
            } else {
              Wechat.login(profile.id, profile.displayName,profile.profileUrl, function (err, user) {
                if (err) {
                  return done(err);
                }
                return done(null, user);
              });
            }
          }
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

Wechat.getAssociation = function (data, callback) {
  user.getUserField(data.uid, 'wxid', function (err, wxid) {
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

Wechat.addMenuItem = function (custom_header, callback) {
  custom_header.authentication.push({
    "route": constants.admin.route,
    "icon": constants.admin.icon,
    "name": constants.name
  });

  callback(null, custom_header);
};

Wechat.login = function (wxid, handle,avatar, callback) {
  Wechat.getUidByWechatId(wxid, function (err, uid) {
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
      }, function (err, uid) {
        if (err) {
          return callback(err);
        }
        // Save wechat-specific information to the user
        user.setUserField(uid, 'wxid', wxid);
        db.setObjectField('wxid:uid', wxid, uid);

        //Set avatar
        db.setObjectField('uid:wxpic',uid,avatar);
        callback(null, {
          uid: uid
        });
      });
    }
  });
};

Wechat.hasWeChatId = function (wxid, callback) {
  db.isObjectField('wxid:uid', wxid, function (err, res) {
    if (err) {
      return callback(err);
    }
    callback(null, res);
  });
};
Wechat.getUidByWechatId = function (wxid, callback) {
  db.getObjectField('wxid:uid', wxid, function (err, uid) {
    if (err) {
      callback(err);
    } else {
      callback(null, uid);
    }
  });
}

Wechat.deleteUserData = function (uid, callback) {
  async.waterfall([
    async.apply(user.getUserField, uid, 'wxid'),
    function (oAuthIdToDelete, next) {
      db.deleteObjectField('wxid:uid', oAuthIdToDelete, next);
    }
  ], function (err) {
    if (err) {
      winston.error('[sso-wechat] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
      return callback(err);
    }
    callback(null, uid);
  });
};

Wechat.list = function (data, callback) {
  Wechat.getWeChatPicture(data.uid, function (err, wechatPicture) {
    if (err) {
      winston.error(err);
      return callback(null, data);
    }
    if (wechatPicture == null) {
      winston.error("[sso-wechat-web]uid:" + data.uid + "存在版本兼容问题。无法调用图像...跳过..");
      return callback(null, data);
    }
    data.pictures.push({
      type: 'wechat',
      url: wechatPicture,
      text: '微信头像'
    });

    callback(null, data);
  });


};

Wechat.get = function (data, callback) {
  if (data.type === 'wechat') {
    Wechat.getWeChatPicture(data.uid, function (err, wechatPicture) {
      if (err) {
        winston.error(err);
        return callback(null, data);
      }
      if (wechatPicture == null) {
        winston.error("[sso-wechat-web]uid:" + data.uid + "存在版本兼容问题。无法调用图像...跳过..");
        return callback(null, data);
      }
      data.picture = wechatPicture;
      callback(null, data);
    });
  } else {
    callback(null, data);
  }
};

Wechat.getWeChatPicture = function (uid, callback) {
  db.getObjectField('uid:wxpic', uid, callback);
}


Wechat.init = function (data, callback) {
  function renderAdmin(req, res) {
    res.render('admin/plugins/sso-wechat', {
      callbackURL: nconf.get('url') + '/auth/wechat/callback'
    });
  }

  data.router.get('/admin/plugins/sso-wechat', data.middleware.admin.buildHeader, renderAdmin);
  data.router.get('/api/admin/plugins/sso-wechat', renderAdmin);

  callback();
};

module.exports = Wechat;
