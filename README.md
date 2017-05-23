## NodeBB Wechat Login

NodeBB 微信登录插件，支持网页版、公众号和小程序。

## 安装

    $ npm install nodebb-plugin-sso-wechat2
    
## 使用

OAuth2.0网页授权，使用此接口须通过微信认证，如果用户在微信中（Web微信除外）访问公众号的第三方网页，公众号开发者可以通过此接口获取当前用户基本信息（包括昵称、性别、城市、国家）。详见：[官方文档](http://mp.weixin.qq.com/wiki/index.php?title=网页授权获取用户基本信息)

详细参见[API文档](http://doxmate.cool/node-webot/wechat-oauth/api.html)

申请好 AppID 和 AppSecret 后进入 NodeBB 的 ACP 后台设置微信登录信息  

如果要在微信中登录，需要选中`通过微信客户端注册`
