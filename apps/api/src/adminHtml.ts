export function renderAdminHtmlPage(): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PureFit LINE AI 顧問設定</title>
  <style>
    :root{--ink:#24211c;--muted:#776f63;--line:#e8ddcb;--brand:#143d2b;--accent:#d9853b;--soft:#f3eadb}
    *{box-sizing:border-box}
    body{font-family:ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;margin:0;background:radial-gradient(circle at top left,#fff7dc 0,#f8efe3 35%,#efe7da 100%);color:var(--ink)}
    main{max-width:920px;margin:auto;padding:18px}
    header{padding:18px 4px 8px}
    h1{font-size:28px;line-height:1.15;margin:0 0 8px}
    h2{font-size:18px;margin:0 0 12px}
    section{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:22px;padding:18px;margin:14px 0;box-shadow:0 14px 34px #4b35200f}
    label{display:block;font-weight:750;margin-top:12px}
    input,select,textarea{width:100%;padding:12px;border:1px solid #d2c5b3;border-radius:14px;margin-top:7px;font:inherit;background:#fffdf9}
    textarea{min-height:96px;resize:vertical}
    button{background:var(--brand);color:white;border:0;border-radius:999px;padding:12px 16px;font-weight:800;margin-top:14px;cursor:pointer;width:100%}
    button.secondary{background:#fff;color:var(--brand);border:1px solid var(--brand)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .muted{color:var(--muted);font-size:14px;line-height:1.55}
    .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:var(--soft);padding:7px 10px;font-size:13px;font-weight:750;margin:4px 6px 4px 0}
    .status{border-left:5px solid var(--accent);background:#fff8eb}
    pre{white-space:pre-wrap;background:#25231f;color:#f8f2e8;padding:14px;border-radius:14px;overflow:auto;font-size:13px}
    .hidden{display:none}
    @media (max-width:720px){main{padding:14px}section{padding:16px;border-radius:18px}.grid{grid-template-columns:1fr}h1{font-size:24px}}
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <main>
    <header>
      <h1>PureFit LINE AI 顧問設定</h1>
      <p class="muted">一般使用者預設使用模式 B；想用自己的 Gemini API Key，可以升級成模式 A。這頁會盡量把事情變簡單，不然設定頁太像水電行估價單，人會想逃。</p>
      <span class="pill">模式 B：共用平台 AI</span>
      <span class="pill">模式 A：自帶 AI Key</span>
      <span class="pill">RAG：已接知識庫</span>
    </header>

    <section class="status">
      <h2>登入狀態</h2>
      <p id="loginStatus" class="muted">正在檢查 LIFF 登入狀態...</p>
      <button id="loginButton" class="secondary hidden" onclick="loginWithLine()">使用 LINE 登入</button>
      <button id="logoutButton" class="secondary hidden" onclick="logoutLine()">登出</button>
    </section>

    <section>
      <h2>我的使用模式</h2>
      <div id="modeSummary" class="muted">登入後會顯示你目前使用模式。</div>
      <label>模式 A workspace 名稱</label>
      <input id="claimName" placeholder="例如：我的 PureFit AI 顧問" />
      <button onclick="claimWorkspace()">建立 / 綁定我的模式 A</button>
      <p class="muted">如果你沒有建立模式 A，傳訊息給官方帳號時會繼續使用模式 B。建立後，系統會用你的 LINE User ID 自動切到你的 workspace。</p>
    </section>

    <section>
      <h2>我的 AI Key</h2>
      <label>我的 Workspace</label>
      <select id="myWorkspace"></select>
      <div class="grid">
        <div><label>Provider</label><select id="myProvider"><option value="gemini">Gemini</option></select></div>
        <div><label>Model</label><input id="myModel" value="gemini-2.5-flash" /></div>
      </div>
      <label>Gemini API Key</label>
      <input id="myApiKey" type="password" placeholder="只會送到後端加密保存，不會顯示回來" />
      <label>回覆語氣</label>
      <input id="myTone" value="自然、溫和、專業" />
      <label>System Prompt</label>
      <textarea id="mySystemPrompt">你是繁體中文 LINE AI 健康顧問，請用自然、溫和、專業的語氣回答。若缺乏足夠資訊，請先提出澄清問題。</textarea>
      <button onclick="saveMyAi()">儲存我的 AI 設定</button>
    </section>

    <section>
      <h2>測試問答</h2>
      <label>測試 Workspace</label>
      <select id="playWorkspace"></select>
      <label>問題</label>
      <input id="message" value="外食族怎麼補充營養？" />
      <button onclick="playground()">測試回覆</button>
      <pre id="result"></pre>
    </section>

    <section>
      <h2>管理員模式</h2>
      <p class="muted">保留給系統管理員使用。一般 LIFF 使用者不需要填這段。</p>
      <label>Admin API Key</label>
      <input id="adminKey" type="password" placeholder="x-admin-key" />
      <button class="secondary" onclick="loadWorkspaces()">讀取全部 Workspaces</button>
      <pre id="workspaces"></pre>

      <h2>管理員建立 Workspace</h2>
      <div class="grid">
        <div><label>名稱</label><input id="wsName" placeholder="客戶 A" /></div>
        <div><label>模式</label><select id="wsMode"><option value="shared">模式 B：共用 LINE OA</option><option value="dedicated">模式 A：專屬設定</option></select></div>
      </div>
      <label>Owner LINE User ID</label><input id="ownerLineUserId" />
      <button class="secondary" onclick="createWorkspace()">管理員建立 Workspace</button>

      <h2>管理員 AI Key / Prompt</h2>
      <label>Workspace ID</label><input id="aiWs" value="default" />
      <div class="grid">
        <div><label>Provider</label><select id="provider"><option value="gemini">Gemini</option></select></div>
        <div><label>Model</label><input id="model" value="gemini-2.5-flash" /></div>
      </div>
      <label>API Key</label><input id="apiKey" type="password" />
      <label>語氣</label><input id="tone" value="自然、溫和、專業" />
      <label>System Prompt</label><textarea id="systemPrompt">你是繁體中文 LINE AI 健康顧問，請用自然、溫和、專業的語氣回答。</textarea>
      <button class="secondary" onclick="saveAi()">管理員儲存 AI 設定</button>

      <h2>管理員 LINE Channel</h2>
      <label>Workspace ID</label><input id="lineWs" />
      <div class="grid"><div><label>Channel ID</label><input id="channelId" /></div><div><label>Destination / Bot user ID</label><input id="destination" /></div></div>
      <label>Basic ID</label><input id="basicId" placeholder="@xxxx" />
      <label>Channel Secret</label><input id="channelSecret" type="password" />
      <label>Channel Access Token</label><input id="channelAccessToken" type="password" />
      <button class="secondary" onclick="saveLine()">管理員儲存 LINE Channel</button>
    </section>
  </main>
  <script>
    let liffToken = '';
    let liffReady = false;
    let myWorkspaces = [];

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const show = (el, visible) => el.classList.toggle('hidden', !visible);
    const api = async (path, body, method='POST') => {
      const res = await fetch(path, { method, headers: {'content-type':'application/json','x-admin-key':adminKey.value}, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    const liffApi = async (path, body, method='POST') => {
      const res = await fetch(path, { method, headers: {'content-type':'application/json','authorization':'Bearer '+liffToken}, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    function renderWorkspaceOptions(){
      const owned = myWorkspaces.filter(w => !w.isDefault);
      const all = myWorkspaces;
      myWorkspace.innerHTML = owned.map(w => '<option value="'+escapeHtml(w.id)+'">'+escapeHtml(w.name)+'（模式 A）</option>').join('');
      playWorkspace.innerHTML = all.map(w => '<option value="'+escapeHtml(w.id)+'">'+escapeHtml(w.name)+(w.isDefault?'（模式 B）':'（模式 A）')+'</option>').join('');
      modeSummary.innerHTML = all.map(w => '<div class="pill">'+escapeHtml(w.name)+' / '+(w.isDefault?'模式 B':'模式 A')+' / AI Key：'+(w.ai.apiKeyConfigured?'已設定':'未設定')+'</div>').join('') || '目前沒有可用 workspace。';
    }
    async function refreshMe(){
      const me = await liffApi('/liff/me', null, 'GET');
      myWorkspaces = me.workspaces || [];
      loginStatus.textContent = '已登入：' + (me.user.displayName || me.user.lineUserId);
      renderWorkspaceOptions();
      show(logoutButton, true);
    }
    async function initLiff(){
      const cfg = await fetch('/liff/config').then(r => r.json());
      if (!cfg.liffId || !window.liff) {
        loginStatus.textContent = 'LIFF 尚未設定完成，仍可使用下方管理員模式。';
        show(loginButton, false);
        return;
      }
      await liff.init({ liffId: cfg.liffId });
      liffReady = true;
      if (!liff.isLoggedIn()) {
        loginStatus.textContent = '尚未登入 LINE。';
        show(loginButton, true);
        return;
      }
      liffToken = liff.getIDToken() || '';
      if (!liffToken) {
        loginStatus.textContent = '無法取得 LIFF ID token，請重新登入。';
        show(loginButton, true);
        return;
      }
      await refreshMe();
    }
    function loginWithLine(){ if (liffReady) liff.login(); }
    function logoutLine(){ if (liffReady) { liff.logout(); location.reload(); } }
    async function claimWorkspace(){
      result.textContent = JSON.stringify(await liffApi('/liff/workspaces/claim', { name: claimName.value || '我的 PureFit AI 顧問' }), null, 2);
      await refreshMe();
    }
    async function saveMyAi(){
      if (!myWorkspace.value) throw new Error('請先建立模式 A workspace');
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/ai', { provider: myProvider.value, model: myModel.value, apiKey: myApiKey.value || undefined, enabled: true });
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/settings', { tone: myTone.value, systemPrompt: mySystemPrompt.value, autoReplyEnabled: true });
      result.textContent = '我的 AI 設定已儲存';
      myApiKey.value = '';
      await refreshMe();
    }
    async function loadWorkspaces(){ workspaces.textContent = JSON.stringify(await api('/admin/workspaces', null, 'GET'), null, 2); }
    async function createWorkspace(){ result.textContent = JSON.stringify(await api('/admin/workspaces', { name: wsName.value, mode: wsMode.value, ownerLineUserId: ownerLineUserId.value || undefined }), null, 2); await loadWorkspaces(); }
    async function saveAi(){
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/ai', { provider: provider.value, model: model.value, apiKey: apiKey.value || undefined, enabled: true });
      await api('/admin/workspaces/'+encodeURIComponent(aiWs.value)+'/settings', { tone: tone.value, systemPrompt: systemPrompt.value, autoReplyEnabled: true });
      result.textContent = 'AI 設定已儲存';
    }
    async function saveLine(){ result.textContent = JSON.stringify(await api('/admin/workspaces/'+encodeURIComponent(lineWs.value)+'/line-channel', { channelId: channelId.value, destination: destination.value, basicId: basicId.value, channelSecret: channelSecret.value, channelAccessToken: channelAccessToken.value, enabled: true }), null, 2); }
    async function playground(){
      if (liffToken) result.textContent = JSON.stringify(await liffApi('/liff/playground', { workspaceId: playWorkspace.value, message: message.value }), null, 2);
      else result.textContent = JSON.stringify(await api('/admin/playground', { workspaceId: playWorkspace.value || 'default', message: message.value }), null, 2);
    }
    initLiff().catch(err => { loginStatus.textContent = 'LIFF 初始化失敗：' + err.message; show(loginButton, true); });
  </script>
</body>
</html>`;
}
