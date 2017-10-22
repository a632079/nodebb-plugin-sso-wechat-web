## NodeBB Wechat Login

NodeBB 微信二维码登录插件。使用 微信开放平台(open.wechat.com) 的网页接入方式。
## 安装

    $ npm install nodebb-plugin-sso-wechat-web
    
## 使用

OAuth2.0网页授权，使用此接口须通过微信开放平台认证(open.wechat.com)。

申请好 AppID 和 AppSecret 后进入 NodeBB 的 ACP 后台设置微信登录信息  

> 鸣谢:  
> nodebb-plugin-sso-wechat2 (基础)  
> nodebb-plugin-sso-qq-fix (提供大致修改思路)  
> nodebb-plugin-sso-facebook (提供要求用户修改邮箱的方法)  
> nodebb-plugin-gravatar (提供添加头像的方法)  