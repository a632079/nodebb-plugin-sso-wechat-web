'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportWechat = require('passport-wechat').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async'),
  winston = module.parent.require('winston');
var constants = Object.freeze({
  'name': "微信",
  'admin': {
    'icon': 'fa-weixin',
    'route': '/plugins/sso-wechat'
  }
});
var authenticationController = module.parent.require('./controllers/authentication');
var Wechat = {};

Wechat.getStrategy = function (strategies, callback) {
  try {
    meta.settings.get('sso-wechat', function (err, settings) {
      if (!err && settings.id && settings.secret) {
        passport.use("wechat", new passportWechat({
          appID: settings.id,
          appSecret: settings.secret,
          client: "web",
          callbackURL: nconf.get('url') + '/auth/wechat/callback',
          state: "",
          scope: 'snsapi_login',
          passReqToCallback: true
        }, function (req, accessToken, refreshToken, profile, expires_in, done) {
          if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
            //如果用户想重复绑定的话，我们就拒绝他。
            Wechat.hasWeChatId(profile.openid, function (err, res) {
              if (err) {
                winston.error(err);
                return done(err);
              }
              if (res) {
                return done("You have binded a WeChat account.If you want to bind another one ,please unbind your account.", flase);
              } else {
                // Save wechat-specific information to the user
                console.log("[SSO-WeChat]User is logged.Binding.");
                //console.log("[SSO-WeChat]req.user:");
                //console.log(req.user);
                //console.log(profile);
                user.setUserField(req.user.uid, 'wxid', profile.openid);
                db.setObjectField('wxid:uid', profile.openid, req.user.uid);
                console.log(`[SSO-WeChat] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nickname}`);

                //Set Picture
                var picture = profile.headimgurl.replace("http://", "https://");
                user.setUserField(req.user.uid, "wxpic", profile.headimgurl)
                return done(null, req.user);
              }
            });
          } else {
            var email = (profile.nickname ? profile.nickname : profile.openid) + "@wx.qq.com";
            var picture = profile.headimgurl.replace("http://", "https://");
            Wechat.login(profile.openid, profile.nickname, email, picture, accessToken, refreshToken, function (err, user) {
              if (err) {
                return done(err);
              }
              // Require collection of email
              if (email.endsWith('@wx.qq.com')) {
                req.session.registration = req.session.registration || {};
                req.session.registration.uid = user.uid;
                req.session.registration.wxid = profile.openid;
              }
              authenticationController.onSuccessfulLogin(req, user.uid, function (err,user) {
                done(err, !err ? user : null);
              });
            });
          }
        }));

        strategies.push({
          name: 'wechat',
          url: '/auth/wechat',
          callbackURL: '/auth/wechat/callback',
          icon: 'fa-weixin',
          scope: '',
          color: "#36bc67"
        });
      }
      callback(null, strategies);
    });
  } catch (err) {
    winston.error(err);
  }
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

Wechat.login = function (wxid, handle, email, avatar, accessToken, refreshToken, callback) {
  Wechat.getUidByWechatId(wxid, function (err, uid) {
    if (err) {
      return callback(err);
    }
    if (uid !== null) {
      // Existing User
      Wechat.storeTokens(uid, accessToken, refreshToken);
      user.setUserField(uid, 'wxpic', avatar); //更新头像
      callback(null, {
        uid: uid
      });
    } else {
      var success = function (uid) {
        // Save wxchat-specific information to the user
        user.setUserField(uid, 'wxid', wxid);
        db.setObjectField('wxid:uid', wxid, uid);
        var autoConfirm = 1;
        user.setUserField(uid, 'email:confirmed', autoConfirm);

        if (autoConfirm) {
          db.sortedSetRemove('users:notvalidated', uid);
        }

        // Save their photo, if present
        if (avatar) {
          user.setUserField(uid, 'wxpic', avatar);
        }

        Wechat.storeTokens(uid, accessToken, refreshToken);

        callback(null, {
          uid: uid
        });
      };
      // New User
      user.create({ username: handle, email: email }, function (err, uid) {
        if (err) {
          return callback(err);
        }
        success(uid);
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
  var uid = data.uid;

  async.waterfall([
    async.apply(user.getUserField, uid, 'wxid'),
    function (oAuthIdToDelete, next) {
      db.deleteObjectField('wxid:uid', oAuthIdToDelete, next);
    }
  ], function (err) {
    if (err) {
      winston.error('[sso-wechat-web] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
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
  user.getUserField(uid, 'wxpic', function (err, pic) {
    if (err) {
      return callback(err);
    }
    callback(null, pic);
  });
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
Wechat.prepareInterstitial = function (data, callback) {
  // Only execute if:
  //   - uid and fbid are set in session
  //   - email ends with "@wx.qq.com"
  if (data.userData.hasOwnProperty('uid') && data.userData.hasOwnProperty('wxid')) {
    user.getUserField(data.userData.uid, 'email', function (err, email) {
      if (email && email.endsWith('@wx.qq.com')) {
        data.interstitials.push({
          template: 'partials/sso-wechat/email.tpl',
          data: {},
          callback: Wechat.storeAdditionalData
        });
      }

      callback(null, data);
    });
  } else {
    callback(null, data);
  }
};

Wechat.storeAdditionalData = function (userData, data, callback) {
  async.waterfall([
    // Reset email confirm throttle
    async.apply(db.delete, 'uid:' + userData.uid + ':confirm:email:sent'),
    async.apply(user.getUserField, userData.uid, 'email'),
    function (email, next) {
      // Remove the old email from sorted set reference
      db.sortedSetRemove('email:uid', email, next);
    },
    async.apply(user.setUserField, userData.uid, 'email', data.email),
    async.apply(user.email.sendValidationEmail, userData.uid, data.email)
  ], callback);
};
Wechat.storeTokens = function (uid, accessToken, refreshToken) {
  //JG: Actually save the useful stuff
  winston.verbose("Storing received WeChat access information for uid(" + uid + ") accessToken(" + accessToken + ") refreshToken(" + refreshToken + ")");
  user.setUserField(uid, 'wxaccesstoken', accessToken);
  user.setUserField(uid, 'wxrefreshtoken', refreshToken);
};

module.exports = Wechat;
