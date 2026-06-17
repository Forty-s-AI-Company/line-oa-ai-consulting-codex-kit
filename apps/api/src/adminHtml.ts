export function renderAdminHtmlPage(options: { showAdminTools?: boolean } = {}): string {
  const adminToolsHtml = options.showAdminTools
    ? `<section id="adminTools">
        <h2>管理員工具</h2>
        <p class="muted">此區只會出現在 /admin，用於檢查 workspace 狀態。</p>
        <label>Admin API Key</label>
        <input id="adminKey" type="password" placeholder="x-admin-key" />
        <button class="secondary" onclick="loadWorkspaces()">讀取 Workspaces</button>
        <pre id="workspaces"></pre>
      </section>`
    : "";
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PureFit AI 健康顧問設定</title>
  <style>
    :root{--ink:#1f2a24;--muted:#68756d;--leaf:#174632;--moss:#dbe9d8;--cream:#fff8ea;--card:#fffefa;--line:#e4dccd;--warn:#b86b22;--danger:#8a1f11}
    *{box-sizing:border-box}
    body{margin:0;font-family:ui-sans-serif,system-ui,"Noto Sans TC",sans-serif;background:linear-gradient(160deg,#f9f0dc 0%,#e7f0e4 48%,#fdfaf2 100%);color:var(--ink)}
    main{max-width:860px;margin:auto;padding:18px 14px 40px}
    header{padding:18px 6px 8px}
    h1{font-size:28px;line-height:1.12;margin:0 0 10px;letter-spacing:-.02em}
    h2{font-size:18px;margin:0 0 10px}
    section{background:rgba(255,254,250,.95);border:1px solid var(--line);border-radius:24px;padding:18px;margin:14px 0;box-shadow:0 18px 40px #3b30200d}
    label{display:block;font-weight:800;margin-top:12px}
    input,select,textarea{width:100%;padding:13px;border:1px solid #d1c8b8;border-radius:15px;margin-top:7px;font:inherit;background:white}
    textarea{min-height:104px;resize:vertical}
    button{width:100%;border:0;border-radius:999px;padding:13px 16px;margin-top:14px;background:var(--leaf);color:white;font-weight:900;font:inherit;cursor:pointer}
    button:disabled{opacity:.72;cursor:not-allowed}
    button.secondary{background:white;color:var(--leaf);border:1px solid var(--leaf)}
    .muted{color:var(--muted);font-size:14px;line-height:1.6}
    .hero{background:radial-gradient(circle at 10% 0%,#ffe1a8 0,#fff8ea 34%,#eef7e8 100%)}
    .pill{display:inline-flex;align-items:center;border-radius:999px;background:var(--moss);padding:7px 11px;margin:4px 6px 4px 0;font-size:13px;font-weight:850;color:var(--leaf)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .hidden{display:none!important}
    .loader{min-height:70vh;display:grid;place-items:center;text-align:center;padding:36px 18px}
    .spinner{width:42px;height:42px;border-radius:50%;border:4px solid #d9e6d5;border-top-color:var(--leaf);margin:0 auto 14px;animation:spin .9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .feedback{display:none;margin-top:12px;padding:12px 14px;border-radius:16px;font-size:14px;line-height:1.55}
    .feedback.show{display:block}
    .feedback.loading{background:#fff3cd;color:#6f4b00;border:1px solid #ffe08a}
    .feedback.success{background:#e8f6ed;color:#16452c;border:1px solid #b7e0c2}
    .feedback.error{background:#fdecea;color:var(--danger);border:1px solid #f4b4aa}
    .manage-card{border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:10px;background:#fffefa}
    .manage-row{display:flex;justify-content:space-between;gap:12px;border-top:1px dashed #e1d8c8;padding-top:10px;margin-top:10px}
    .manage-row strong{font-size:14px}
    .manage-row span{font-size:14px;text-align:right;color:var(--muted);word-break:break-all}
    @media (max-width:720px){main{padding:14px 12px 32px}h1{font-size:24px}.grid{grid-template-columns:1fr}section{border-radius:20px;padding:16px}.manage-row{display:block}.manage-row span{display:block;text-align:left;margin-top:4px}}
  </style>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
</head>
<body>
  <main>
    <div id="loader" class="loader">
      <div>
        <div class="spinner"></div>
        <h2>正在載入你的 AI 設定</h2>
        <p class="muted">正在確認 LINE 登入、工作區與已綁定的 AI。請稍候一下。</p>
      </div>
    </div>

    <div id="app" class="hidden">
      <header class="hero">
        <h1>PureFit AI 健康顧問設定</h1>
        <p class="muted">這裡可以建立你的 AI 健康顧問工作區，選擇 ChatGPT、Gemini 或 DeepSeek，並使用你自己的 API Key。設定完成後，LINE OA 會用你的 AI 回覆。</p>
        <span class="pill">ChatGPT</span><span class="pill">Gemini</span><span class="pill">DeepSeek</span><span class="pill">RAG 知識庫</span>
      </header>

      <section>
        <h2>登入狀態</h2>
        <p id="loginStatus" class="muted">正在檢查 LIFF 登入狀態...</p>
        <button id="loginButton" class="secondary hidden" onclick="loginWithLine()">使用 LINE 登入</button>
        <button id="logoutButton" class="secondary hidden" onclick="logoutLine()">登出 LINE</button>
      </section>

      <section>
        <h2>AI 管理</h2>
        <p class="muted">這裡會列出你目前已綁定的 AI。API Key 只會顯示前後幾碼，中間會用星號遮住。</p>
        <div id="aiManagement"></div>
      </section>

      <section>
        <h2>第一次使用</h2>
        <p class="muted">如果你還沒有自己的 AI 工作區，請先建立。之後每次進來都會看到已綁定狀態。</p>
        <label>工作區名稱</label>
        <input id="claimName" value="我的 PureFit AI 健康顧問" />
        <button onclick="claimWorkspace()">建立 / 綁定我的工作區</button>
        <div id="modeSummary" class="muted"></div>
      </section>

      <section>
        <h2>AI 設定</h2>
        <label>我的工作區</label>
        <select id="myWorkspace" onchange="syncFormWithSelectedWorkspace()"></select>
        <div class="grid">
          <div><label>AI 供應商</label><select id="myProvider" onchange="renderModelOptions()"></select></div>
          <div><label>模型</label><select id="myModel"></select></div>
        </div>
        <label>API Key</label>
        <input id="myApiKey" type="password" placeholder="貼上你的 API Key。若只改模型，可留空沿用原 Key。" />
        <label>回答語氣</label>
        <input id="myTone" value="溫和、專業、像健康顧問" />
        <label>系統提示詞</label>
        <textarea id="mySystemPrompt">你是 PureFit LINE AI 健康顧問。請用繁體中文，根據知識庫資料與使用者問題，提供清楚、可執行、溫和的健康與營養建議。不要做醫療診斷，遇到疾病、用藥、孕期或高風險狀況時，請提醒使用者諮詢專業醫療人員。</textarea>
        <button id="saveAiButton" onclick="saveMyAi()">儲存 AI 設定</button>
        <div id="saveAiFeedback" class="feedback" role="status" aria-live="polite"></div>
        <p class="muted">安全提醒：不要把別人的 API Key 貼進來。模型費用會由你自己的供應商帳號計算。</p>
      </section>
      ${adminToolsHtml}
    </div>
  </main>

  <script>
    let liffToken = '';
    let liffReady = false;
    let myWorkspaces = [];
    let modelCatalog = [];

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const show = (el, visible) => el.classList.toggle('hidden', !visible);
    const selectedProvider = () => modelCatalog.find((item) => item.provider === myProvider.value) || modelCatalog[0];
    const ownedWorkspaces = () => myWorkspaces.filter((workspace) => !workspace.isDefault);

    function showApp() {
      show(loader, false);
      show(app, true);
    }

    function setFeedback(target, type, message) {
      target.className = 'feedback show ' + type;
      target.textContent = message;
    }

    function clearFeedback(target) {
      target.className = 'feedback';
      target.textContent = '';
    }

    function getErrorMessage(error) {
      if (!error) return '發生未知錯誤，請稍後再試。';
      return error.message || String(error);
    }

    function renderModelOptions(selectedModel){
      const provider = selectedProvider();
      const options = provider?.modelOptions || (provider?.models || []).map((model) => ({ id: model, label: model }));
      myModel.innerHTML = options.map((model) => {
        const suffix = model.status === 'legacy' ? ' / legacy' : (model.id === provider?.recommendedModel ? ' / 推薦' : '');
        return '<option value="'+escapeHtml(model.id)+'">'+escapeHtml(model.label || model.id)+escapeHtml(suffix)+'</option>';
      }).join('');
      if (selectedModel && options.some((model) => model.id === selectedModel)) myModel.value = selectedModel;
    }

    function renderProviderOptions(){
      myProvider.innerHTML = modelCatalog.map((provider) => '<option value="'+escapeHtml(provider.provider)+'">'+escapeHtml(provider.label)+'</option>').join('');
      renderModelOptions();
    }

    function renderAiManagement(){
      const owned = ownedWorkspaces();
      aiManagement.innerHTML = owned.length
        ? owned.map((workspace) => {
            const ai = workspace.ai || {};
            return '<div class="manage-card">'
              + '<strong>'+escapeHtml(workspace.name)+'</strong>'
              + '<div class="manage-row"><strong>供應商</strong><span>'+escapeHtml(ai.provider || '尚未設定')+'</span></div>'
              + '<div class="manage-row"><strong>模型</strong><span>'+escapeHtml(ai.model || '尚未設定')+'</span></div>'
              + '<div class="manage-row"><strong>API Key</strong><span>'+escapeHtml(ai.maskedApiKey || (ai.apiKeyConfigured ? '已設定' : '尚未設定'))+'</span></div>'
              + '<div class="manage-row"><strong>狀態</strong><span>'+escapeHtml(ai.enabled === false ? '停用' : ai.apiKeyConfigured ? '已啟用' : '待設定')+'</span></div>'
              + '</div>';
          }).join('')
        : '<p class="muted">目前尚未綁定自己的 AI。請先建立工作區並儲存 AI 設定。</p>';
    }

    function syncFormWithSelectedWorkspace(){
      const workspace = ownedWorkspaces().find((item) => item.id === myWorkspace.value);
      if (!workspace?.ai?.apiKeyConfigured) return;
      myProvider.value = workspace.ai.provider || myProvider.value;
      renderModelOptions(workspace.ai.model);
    }

    function renderWorkspaceOptions(){
      const owned = ownedWorkspaces();
      myWorkspace.innerHTML = owned.map((workspace) => '<option value="'+escapeHtml(workspace.id)+'">'+escapeHtml(workspace.name)+'</option>').join('');
      modeSummary.innerHTML = owned.length
        ? owned.map((workspace) => '<div class="pill">'+escapeHtml(workspace.name)+' / AI Key '+(workspace.ai.apiKeyConfigured ? '已設定' : '未設定')+'</div>').join('')
        : '<p class="muted">還沒有自己的 AI 工作區。請先建立工作區。</p>';
      renderAiManagement();
      syncFormWithSelectedWorkspace();
    }

    async function readJsonResponse(res, label) {
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text || res.statusText };
      }
      if (!res.ok) {
        const detail = data.error || data.message || res.statusText || 'HTTP ' + res.status;
        throw new Error(label + '失敗：' + detail);
      }
      return data;
    }

    async function liffApi(path, body, method='POST', label='API 呼叫') {
      const res = await fetch(path, {
        method,
        headers: {'content-type':'application/json','authorization':'Bearer '+liffToken},
        body: body ? JSON.stringify(body) : undefined
      });
      return readJsonResponse(res, label);
    }

    async function adminApi(path, body, method='POST') {
      const res = await fetch(path, {
        method,
        headers: {'content-type':'application/json','x-admin-key':adminKey.value},
        body: body ? JSON.stringify(body) : undefined
      });
      return readJsonResponse(res, '管理員 API');
    }

    async function loadWorkspaces(){
      if (!window.adminKey || !window.workspaces) return;
      workspaces.textContent = JSON.stringify(await adminApi('/admin/workspaces', null, 'GET'), null, 2);
    }

    async function refreshMe(){
      const me = await liffApi('/liff/me', null, 'GET', '讀取登入狀態');
      myWorkspaces = me.workspaces || [];
      loginStatus.textContent = '已登入：' + (me.user.displayName || me.user.lineUserId);
      show(logoutButton, true);
      renderWorkspaceOptions();
    }

    async function initLiff(){
      try {
        const [cfg, catalog] = await Promise.all([
          fetch('/liff/config').then((res) => res.json()),
          fetch('/liff/model-catalog').then((res) => res.json())
        ]);
        modelCatalog = catalog.providers || [];
        renderProviderOptions();

        if (catalog.updating || cfg.modelCatalogUpdating) {
          loginStatus.textContent = '系統模型清單更新中，請稍後再試。';
          showApp();
          return;
        }
        if (!cfg.liffId || !window.liff) {
          loginStatus.textContent = 'LIFF 尚未設定完成，請聯絡管理員。';
          showApp();
          return;
        }
        await liff.init({ liffId: cfg.liffId });
        liffReady = true;
        if (!liff.isLoggedIn()) {
          loginStatus.textContent = '尚未登入 LINE。';
          show(loginButton, true);
          showApp();
          return;
        }
        liffToken = liff.getIDToken() || '';
        if (!liffToken) {
          loginStatus.textContent = '無法取得 LIFF ID token，請重新登入。';
          show(loginButton, true);
          showApp();
          return;
        }
        await refreshMe();
        showApp();
      } catch (error) {
        loginStatus.textContent = 'LIFF 初始化失敗：' + getErrorMessage(error);
        showApp();
      }
    }

    function loginWithLine(){ if (liffReady) liff.login(); }
    function logoutLine(){ if (liffReady) { liff.logout(); location.reload(); } }

    async function claimWorkspace(){
      setFeedback(saveAiFeedback, 'loading', '正在建立或綁定你的工作區...');
      await liffApi('/liff/workspaces/claim', { name: claimName.value || '我的 PureFit AI 健康顧問' }, 'POST', '建立工作區');
      await refreshMe();
      setFeedback(saveAiFeedback, 'success', '工作區已準備完成，可以儲存 AI 設定。');
    }

    async function saveMyAi(){
      clearFeedback(saveAiFeedback);
      if (!myWorkspace.value) {
        setFeedback(saveAiFeedback, 'error', '請先建立或選擇你的工作區，再儲存 AI 設定。');
        return;
      }

      saveAiButton.disabled = true;
      const originalText = saveAiButton.textContent;
      saveAiButton.textContent = '儲存中...';
      setFeedback(saveAiFeedback, 'loading', '正在儲存 AI 設定，請稍候...');

      try {
        await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/ai', {
          provider: myProvider.value,
          model: myModel.value,
          apiKey: myApiKey.value || undefined,
          enabled: true
        }, 'PUT', '儲存 AI Key / 模型');
        await liffApi('/liff/workspaces/'+encodeURIComponent(myWorkspace.value)+'/settings', {
          tone: myTone.value,
          systemPrompt: mySystemPrompt.value,
          autoReplyEnabled: true
        }, 'PUT', '儲存回答設定');
        myApiKey.value = '';
        await refreshMe();
        setFeedback(saveAiFeedback, 'success', 'AI 設定已儲存成功。你現在可以回到 LINE 提問。');
      } catch (error) {
        setFeedback(saveAiFeedback, 'error', '儲存失敗：' + getErrorMessage(error));
      } finally {
        saveAiButton.disabled = false;
        saveAiButton.textContent = originalText || '儲存 AI 設定';
      }
    }

    initLiff();
  </script>
</body>
</html>`;
}
