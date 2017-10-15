<div class="row">
    <div class="col-sm-2 col-xs-12 settings-header">Wechat SSO Web (QRcode)</div>
    <div class="col-sm-10 col-xs-12">
        <div class="alert alert-info">
            <p>
                请先在微信开放中心（open.wechat.com）注册。
            </p>
        </div>
        <form class="sso-wechat-settings">
            <div class="form-group">
                <label for="id">App ID</label>
                <input type="text" name="id" title="App ID" class="form-control" placeholder="App ID">
            </div>
            <div class="form-group">
                <label for="secret">App Secret</label>
                <input type="text" name="secret" title="App Secret" class="form-control" placeholder="App Secret" />
            </div>
            <div class="form-group alert alert-warning">
                <label for="callback">Your NodeBB&apos;s "Authorization callback URL"</label>
                <input type="text" id="callback" title="Authorization callback URL" class="form-control" value="{callbackURL}" readonly />
            </div>
        </form>
    </div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
    <i class="material-icons">save</i>
</button>
