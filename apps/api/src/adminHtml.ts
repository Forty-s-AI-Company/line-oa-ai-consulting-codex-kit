export function renderAdminHtmlPage(): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PureFit AI 健康顧問設定</title>
  <style>
    :root{--ink:#1f2a24;--muted:#68756d;--leaf:#174632;--moss:#dbe9d8;--cream:#fff8ea;--card:#fffefa;--line:#e4dccd;--warn:#b86b22}
    *{box-sizing:border-box}
    body{margin:0;font-family:ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;background:linear-gradient(160deg,#f9f0dc 0%,#e7f0e4 48%,#fdfaf2 100%);color:var(--ink)}
    main{max-width:860px;margin:auto;padding:18px 14px 40px}
    header{padding:18px 6px 8px}
    h1{font-size:28px;line-height:1.12;margin:0 0 10px;letter-spacing:-.02em}
    h2{font-size:18px;margin:0 0 10px}
    h3{font-size:15px;margin:14px 0 8px}
    section{background:rgba(255,254,250,.95);border:1px solid var(--line);border-radius:24px;padding:18px;margin:14px 0;box-shadow:0 18px 40px #3b30200d}
    label{display:block;font-weight:800;margin-top:12px}
    input,select,textarea{width:100%;padding:13px;border:1px solid #d1c8b8;border-radius:15px;margin-top:7px;font:inherit;background:white}
    textarea{min-height:104px;resize:vertical}
    button{width:100%;border:0;border-radius:999px;padding:13px 16px;margin-top:14px;background:var(--leaf);color:white;font-weight:900;font:inherit;cursor:pointer}
    button.secondary{background:white;color:var(--leaf);border:1px solid var(--leaf)}
    button.ghost{background:var(--moss);color:var(--leaf)}
    .muted{color:var(--muted);font-size:14px;line-height:1.6}
    .hero{background:radial-gradient(circle at 10% 0%,#ffe1a8 0,#fff8ea 34%,#eef7e8 100%)}
    .pill{display:inline-flex;align-items:center;border-radius:999px;background:var(--moss);padding:7px 11px;margin:4px 6px 4px 0;font-size:13px;font-weight:850;color:var(--leaf)}
    .step{display:flex;gap:12px;align-items:flex-start;margin:12px 0}
    .num{flex:0 0 30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--leaf);color:white;font-weight:900}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .status{border-left:6px solid var(--warn)}
    .hidden{display:none}
    pre{white-space:pre-wrap;background:#1f241f;color:#f7f1e8;padding:14px;border-radius:16px;overflow:auto;font-size:13px}
    details{margin-top:10px}
    summary{cursor:pointer;font-weight:900;color:var(--leaf)}
    @media (max-width:720px){main{padding:14px 12px 32px}h1{font-size:24px}.grid{grid-template-columns:1fr}section{border-radius:20px;padding:16px}}
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <main>
    <header class="hero">
      <h1>PureFit AI 健康顧問設定</h1>
      <p class="muted">這裡是你的個人 AI 設定入口。B2C 模式下，每位用戶使用自己的 AI Key；沒有設定前，LINE OA 只會提醒你先完成設定。</p>
      <span class="pill">ChatGPT</span><span class="pill">Gemini</span><span class="pill">DeepSeek</span><span class="pill">RAG 知識庫</span>
    </header>

    <section class="status">
      <h2>登入狀態</h2>
      <p id="loginStatus" class="muted">正在啟動 LIFF...</p>
      <button id="loginButton" class="secondary hidden" onclick="loginWithLine()">使用 LINE 登入</button>
      <button id="logoutButton" class="secondary hidden" onclick="logoutLine()">登出 LINE</button>
    </section>

    <section>
      <h2>開始使用</h2>
      <div class="step"><div class="num">1</div><div><strong>建立你的 AI 健康顧問</strong><p class="muted">系統會把這個 LINE 帳號綁定到你的個人 workspace。</p></div></div>
      <div class="step"><div class="num">2</div><div><strong>選擇 AI 供應商與模型</strong><p class="muted">可選 ChatGPT、Gemini、DeepSeek。API Key 會加密保存。</p></div></div>
      <div class="step"><div class="num">3</div><div><strong>回到 LINE 提問</strong><p class="muted">你的問題會先查知識庫，再交給你的 AI 整理成回覆。</p></div></div>
      <label>顧問名稱</label>
      <input id="claimName" value="我的 PureFit AI 健康顧問" />
      <button onclick="claimWorkspace()">建立 / 取得我的顧問</button>
      <div id="modeSummary" class="muted"></div>
    </section>

    <section>
      <h2>AI 設定</h2>
      <label>我的顧問</label>
      <select id="myWorkspace"></select>
      <div class="grid">
        <div><label>AI 供應商</label><select id="myProvider" onchange="renderModelOptions()"></select></div>
        <div><label>模型</label><select id="myModel"></select></div>
      </div>
      <label>API Key</label>
      <input id="myApiKey" type="password" placeholder="只在第一次設定或更換 Key 時填寫" />
      <label>回答風格</label>
      <input id="myTone" value="溫和、清楚、像健康顧問" />
      <label>自訂系統提示</label>
      <textarea id="mySystemPrompt">你是繁體中文 LINE AI 健康顧問。請先根據知識庫回答，再用溫和、清楚、可執行的方式整理。若資訊不足，請先提出一個追問。</textarea>
      <button onclick="saveMyAi()">儲存 AI 設定</button>
      <p class="muted">安全提醒：不要把別人的 API Key 貼進來。模型費用會由你自己的供應商帳號計算。</p>
    </section>

    <section>
      <h2>測試你的顧問</h2>
      <label>測試 Workspace</label>
      <select id="playWorkspace"></select>
      <label>問題</label>
      <input id="message" value="外食族怎麼補充營養？" />
      <button class="ghost" onclick="playground()">送出測試</button>
      <pre id="result"></pre>
    </section>

    <details>
      <summary>管理員工具</summary>
      <section>
        <label>Admin API Key</label>
        <input id="adminKey" type="password" placeholder="x-admin-key" />
        <button class="secondary" onclick="loadWorkspaces()">讀取 Workspaces</button>
        <pre id="workspaces"></pre>
      </section>
    </details>
  </main>
  <script>
    let liffToken = '';
    let liffReady = false;
    let myWorkspaces = [];
    let modelCatalog = [];

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const show = (el, visible) => el.classList.toggle('hidden', !visible);
    const selectedProvider = () => modelCatalog.find((item) => item.provider === myProvider.value) || modelCatalog[0];

    function renderModelOptions(){
      const provider = selectedProvider();
      myModel.innerHTML = (provider?.models || []).map((model) => '<option value="'+escapeHtml(model)+'">'+escapeHtml(model)+'</option>').join('');
    }

    function renderProviderOptions(){
      myProvider.innerHTML = modelCatalog.map((provider) => '<option value="'+escapeHtml(provider.provider)+'">'+escapeHtml(provider.label)+'</option>').join('');
      renderModelOptions();
    }

    function renderWorkspaceOptions(){
      const owned = myWorkspaces.filter((workspace) => !workspace.isDefault);
      myWorkspace.innerHTML = owned.map((workspace) => '<option value="'+escapeHtml(workspace.id)+'">'+escapeHtml(workspace.name)+'</option>').join('');
      playWorkspace.innerHTML = owned.map((workspace) => '<option value="'+escapeHtml(workspace.id)+'">'+escapeHtml(workspace.name)+'</option>').join('');
      modeSummary.innerHTML = owned.length
        ? owned.map((workspace) => '<div class="pill">'+escapeHtml(workspace.name)+' / AI Key '+(workspace.ai.apiKeyConfigured ? '已設定' : '未設定')+'</div>').join('')
        : '<p class="muted">你還沒有個人 AI 顧問。請先按上方按鈕建立。</p>';
    }

    async function liffApi(path, body, method='POST') {
      const res = await fetch(path, {
        method,
        headers: {'content-type':'application/json','authorization':'Bearer '+liffToken},
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    }

    async function adminApi(path, body, method='POST') {
      const res = await fetch(path, {
        method,
        headers: {'content-type':'application/json','x-admin-key':adminKey.value},
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      return data;
    }

    async function refreshMe(){
      const me = await liffApi('/liff/me', null, 'GET');
      myWorkspaces = me.workspaces || [];
      loginStatus.textContent = '已登入：' + (me.user.displayName || me.user.lineUserId);
      show(logoutButton, true);
      renderWorkspaceOptions();
    }

    async function initLiff(){
      const [cfg, catalog] = await Promise.all([
        fetch('/liff/config').then((res) => res.json()),
        fetch('/liff/model-catalog').then((res) => res.json())
      ]);
      modelCatalog = catalog.providers || [];
      renderProviderOptions();

      if (catalog.updating || cfg.modelCatalogUpdating) {
        loginStatus.textContent = '系統模型清單更新中，請稍後再試。';
        return;
      }
      if (!cfg.liffId || !window.liff) {
        loginStatus.textContent = 'LIFF 尚未設定完成，請聯絡管理員。';
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
      result.textContent = JSON.stringify(await liffApi('/liff/workspaces/claim', { name: claimName.value || '我的 PureFit AI 健康顧問' }), null, 2);
      await refreshMe();
    }

    async function saveMyAi(){
      if (!myWorkspace.value) throw new Error('請先建立你的個人 AI 顧問。');
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/ai', {
        provider: myProvider.value,
        model: myModel.value,
        apiKey: myApiKey.value || undefined,
        enabled: true
      });
      await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/settings', {
        tone: myTone.value,
        systemPrompt: mySystemPrompt.value,
        autoReplyEnabled: true
      });
      myApiKey.value = '';
      result.textContent = 'AI 設定已儲存。你可以回 LINE 開始提問。';
      await refreshMe();
    }

    async function playground(){
      if (!playWorkspace.value) throw new Error('請先建立並選擇你的個人 AI 顧問。');
      result.textContent = JSON.stringify(await liffApi('/liff/playground', { workspaceId: playWorkspace.value, message: message.value }), null, 2);
    }

    async function loadWorkspaces(){
      workspaces.textContent = JSON.stringify(await adminApi('/admin/workspaces', null, 'GET'), null, 2);
    }

    initLiff().catch((error) => {
      loginStatus.textContent = 'LIFF 初始化失敗：' + error.message;
      show(loginButton, true);
    });
  </script>
</body>
</html>`;
}
