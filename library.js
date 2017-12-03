'use strict'

const user = module.parent.require('./user')
const meta = module.parent.require('./meta')
const db = module.parent.require('../src/database')
const passport = module.parent.require('passport')
const PassportWechat = require('passport-wechat').Strategy
// const fs = module.parent.require('fs')
// const path = module.parent.require('path')
const nconf = module.parent.require('nconf')
const async = module.parent.require('async')
const winston = module.parent.require('winston')
const constants = Object.freeze({
  'name': '微信',
  'admin': {
    'icon': 'fa-weixin',
    'route': '/plugins/sso-wechat'
  }
})
const authenticationController = module.parent.require('./controllers/authentication')
const Wechat = {}

Wechat.getStrategy = function (strategies, callback) {
  try {
    meta.settings.get('sso-wechat', function (err, settings) {
      if (!err && settings.id && settings.secret) {
        passport.use('wechat', new PassportWechat({
          appID: settings.id,
          appSecret: settings.secret,
          client: 'web',
          callbackURL: nconf.get('url') + '/auth/wechat/callback',
          state: '',
          scope: 'snsapi_login',
          passReqToCallback: true
        }, function (req, accessToken, refreshToken, profile, expires, done) {
          if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
            // if user want to bind more than one NodeBB User , we refuse him/her.
            Wechat.hasWeChatId(profile.openid, function (err, res) {
              if (err) {
                winston.error(err)
                return done(err)
              }
              if (res) {
                return done(new Error('You have binded a WeChat account.If you want to bind another one ,please unbind your account.'), false)
              } else {
                winston.info('[SSO-WeChat-web]User is logged.Binding.')
                user.setUserField(req.user.uid, 'wxid', profile.openid)
                db.setObjectField('wxid:uid', profile.openid, req.user.uid)
                winston.info(`[SSO-WeChat-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nickname}`)

                // Set Picture
                const picture = profile.headimgurl.replace('http://', 'https://')
                user.setUserField(req.user.uid, 'wxpic', picture)
                return done(null, req.user)
              }
            })
          } else {
            var email = (profile.nickname ? profile.nickname : profile.openid) + '@wx.qq.com'
            var picture = profile.headimgurl.replace('http://', 'https://')
            Wechat.login(profile.openid, profile.nickname, email, picture, accessToken, refreshToken, function (err, user) {
              if (err) {
                return done(err)
              }
              // Require collection of email
              if (email.endsWith('@wx.qq.com')) {
                req.session.registration = req.session.registration || {}
                req.session.registration.uid = user.uid
                req.session.registration.wxid = profile.openid
              }
              authenticationController.onSuccessfulLogin(req, user.uid, function (err) {
                if (err) {
                  return done(err)
                } else {
                  winston.info('[sso-wechat-web] user:' + user.uid + ' is logged via wechat.(openid is ' + profile.openid + ' and nickname is ' + profile.nickname + ')')
                  done(null, user)
                }
              })
            })
          }
        }))

        strategies.push({
          name: 'wechat',
          url: '/auth/wechat',
          callbackURL: '/auth/wechat/callback',
          icon: 'fa-weixin',
          scope: '',
          color: '#36bc67' // Try change color
        })
      }
      callback(null, strategies)
    })
  } catch (err) {
    winston.error(err)
  }
}

Wechat.getAssociation = function (data, callback) {
  user.getUserField(data.uid, 'wxid', function (err, wxid) {
    if (err) {
      return callback(err, data)
    }

    if (wxid) {
      data.associations.push({
        associated: true,
        name: constants.name,
        icon: constants.admin.icon
      })
    } else {
      data.associations.push({
        associated: false,
        url: nconf.get('url') + '/auth/wechat',
        name: constants.name,
        icon: constants.admin.icon
      })
    }

    callback(null, data)
  })
}

Wechat.addMenuItem = function (header, callback) {
  header.authentication.push({
    'route': constants.admin.route,
    'icon': constants.admin.icon,
    'name': constants.name
  })

  callback(null, header)
}

Wechat.login = function (wxid, handle, email, avatar, accessToken, refreshToken, callback) {
  Wechat.getUidByWechatId(wxid, function (err, uid) {
    if (err) {
      return callback(err)
    }
    if (uid !== null) {
      // Existing User
      Wechat.storeTokens(uid, accessToken, refreshToken)
      user.setUserField(uid, 'wxpic', avatar) // update avatar
      callback(null, {
        uid: uid
      })
    } else {
      var success = function (uid) {
        // Save wxchat-specific information to the user
        user.setUserField(uid, 'wxid', wxid)
        db.setObjectField('wxid:uid', wxid, uid)
        var autoConfirm = 1
        user.setUserField(uid, 'email:confirmed', autoConfirm)

        if (autoConfirm) {
          db.sortedSetRemove('users:notvalidated', uid)
        }

        // Save their photo, if present
        if (avatar) {
          user.setUserField(uid, 'wxpic', avatar)
          user.setUserField(uid, 'picture', avatar)
        }

        Wechat.storeTokens(uid, accessToken, refreshToken)
        winston.info('[sso-wechat-web]uid:' + uid + 'is created successfully.(openid is ' + wxid + ', nickname is ' + handle + ')')
        callback(null, {
          uid: uid
        })
      }
      // New User
      user.create({ username: handle, email: email }, function (err, uid) {
        if (err) {
          // If username is invalid , just use wx- + openid as user's username
          user.create({ username: 'wx-' + wxid, email: email }, function (err, uid) {
            if (err) {
              return callback(err)
            } else {
              success(uid)
            }
          })
        }
        success(uid)
      })
    }
  })
}

Wechat.hasWeChatId = function (wxid, callback) {
  db.isObjectField('wxid:uid', wxid, function (err, res) {
    if (err) {
      return callback(err)
    }
    callback(null, res)
  })
}
Wechat.getUidByWechatId = function (wxid, callback) {
  db.getObjectField('wxid:uid', wxid, function (err, uid) {
    if (err) {
      callback(err)
    } else {
      callback(null, uid)
    }
  })
}

Wechat.deleteUserData = function (data, callback) {
  var uid = data.uid

  async.waterfall([
    async.apply(user.getUserField, uid, 'wxid'),
    function (oAuthIdToDelete, next) {
      db.deleteObjectField('wxid:uid', oAuthIdToDelete, next)
      winston.info('[sso-wechat-web] uid:' + uid + 'have invalidated his wechat successfully.')
    }
  ], function (err) {
    if (err) {
      winston.error('[sso-wechat-web] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err)
      return callback(err)
    }
    callback(null, uid)
  })
}

Wechat.list = function (data, callback) {
  Wechat.getWeChatPicture(data.uid, function (err, wechatPicture) {
    if (err) {
      winston.error(err)
      return callback(null, data)
    }
    if (wechatPicture == null) {
      winston.error('[sso-wechat-web]uid:' + data.uid + 'is invalid,skipping...')
      return callback(null, data)
    }
    data.pictures.push({
      type: 'wechat',
      url: wechatPicture,
      text: '微信头像'
    })

    callback(null, data)
  })
}

Wechat.get = function (data, callback) {
  if (data.type === 'wechat') {
    Wechat.getWeChatPicture(data.uid, function (err, wechatPicture) {
      if (err) {
        winston.error(err)
        return callback(null, data)
      }
      if (wechatPicture == null) {
        winston.error('[sso-wechat-web]uid:' + data.uid + 'is invalid,skipping...')
        return callback(null, data)
      }
      data.picture = wechatPicture
      callback(null, data)
    })
  } else {
    callback(null, data)
  }
}

Wechat.getWeChatPicture = function (uid, callback) {
  user.getUserField(uid, 'wxpic', function (err, pic) {
    if (err) {
      return callback(err)
    }
    callback(null, pic)
  })
}

Wechat.init = function (data, callback) {
  function renderAdmin (req, res) {
    res.render('admin/plugins/sso-wechat', {
      callbackURL: nconf.get('url') + '/auth/wechat/callback'
    })
  }

  data.router.get('/admin/plugins/sso-wechat', data.middleware.admin.buildHeader, renderAdmin)
  data.router.get('/api/admin/plugins/sso-wechat', renderAdmin)

  // DEV Router
  /*
  data.router.get('/sso-wechat/invalidate', function (req, res) {
    if (req.user.hasOwnProperty('uid') && req.user.uid > 0) {
      var uid = req.user.uid;
      user.getUserField(uid, 'wxid', function (err, wxid) {
        if (err) {
          res.json(err);
        } else {
          db.deleteObjectField('wxid:uid', wxid, function (err) {
            if (err) {
              res.json(err);
            } else {
              //check
              db.hasWeChatId(wxid, function (err, res) {
                if (res) {
                  res.json({ code: 500, text: "Fuck!" });
                } else {
                  res.json({ code: 200, text: "ok" });
                }
              });
            }
          });
        }
      }),
        function (oAuthIdToDelete, next) {
          db.deleteObjectField('wxid:uid', oAuthIdToDelete, next);
          winston.verbose('[sso-wechat-web] uid:' + uid + 'have invalidated his wechat successfully.');
        }
    } else {
      res.json({ code: 500 });
    }
  });
  */
  callback()
}
Wechat.prepareInterstitial = function (data, callback) {
  // Only execute if:
  //   - uid and fbid are set in session
  //   - email ends with "@wx.qq.com"
  if (data.userData.hasOwnProperty('uid') && data.userData.hasOwnProperty('wxid')) {
    user.getUserField(data.userData.uid, 'email', function (err, email) {
      if (err) {
        return callback(err)
      }
      if (email && email.endsWith('@wx.qq.com')) {
        data.interstitials.push({
          template: 'partials/sso-wechat/email.tpl',
          data: {},
          callback: Wechat.storeAdditionalData
        })
      }

      callback(null, data)
    })
  } else {
    callback(null, data)
  }
}

Wechat.storeAdditionalData = function (userData, data, callback) {
  async.waterfall([
    // Reset email confirm throttle
    async.apply(db.delete, 'uid:' + userData.uid + ':confirm:email:sent'),
    async.apply(user.getUserField, userData.uid, 'email'),
    function (email, next) {
      email = email.toLowerCase()
      // Remove the old email from sorted set reference
      db.sortedSetRemove('email:uid', email, next)
    },
    async.apply(user.setUserField, userData.uid, 'email', data.email),
    async.apply(user.email.sendValidationEmail, userData.uid, data.email)
  ], callback)
}
Wechat.storeTokens = function (uid, accessToken, refreshToken) {
  // JG: Actually save the useful stuff
  winston.info('Storing received WeChat access information for uid(' + uid + ') accessToken(' + accessToken + ') refreshToken(' + refreshToken + ')')
  user.setUserField(uid, 'wxaccesstoken', accessToken)
  user.setUserField(uid, 'wxrefreshtoken', refreshToken)
}

module.exports = Wechat
