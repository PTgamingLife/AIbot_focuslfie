// 共用：路由、LIFF 初始化、API 呼叫、UI 小工具
(function () {
  const FL = (window.FL = { pages: {} });
  const cfg = window.FL_CONFIG;
  const FL_TITLES = { home: 'AI專注訓練器', health: '健康檢測', finance: '財務健康度檢測', profile: '個人資訊填寫', contact: '聯絡專員' };
  const FL_FULL_PAGES = ['profile'];

  FL.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FL.root = () => document.getElementById('fl-root');
  FL.render = (html) => { FL.root().innerHTML = html; window.scrollTo(0, 0); };
  FL.toast = (msg) => {
    const t = document.getElementById('fl-toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(FL._toastTimer); FL._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  };
  FL.loading = (msg) => FL.render(`<div class="fl-card fl-center"><div class="fl-spinner"></div><p>${FL.esc(msg)}</p></div>`);
  FL.errorView = (msg, retry) => {
    FL.render(`<div class="fl-card fl-center"><h2>發生問題</h2><p>${FL.esc(msg)}</p>
      <button class="fl-btn" id="fl-retry">重試</button></div>`);
    document.getElementById('fl-retry').onclick = retry;
  };

  // 從 ?p= 或 LIFF 轉址參數 liff.state 取得頁面
  function flPage() {
    const q = new URLSearchParams(location.search);
    let p = q.get('p');
    if (!p && q.get('liff.state')) p = new URLSearchParams(q.get('liff.state').replace(/^[^?]*\?/, '')).get('p');
    return FL_TITLES[p] ? p : 'home';
  }

  FL.token = null;
  FL.inLiff = false;

  async function flInitLiff(page) {
    const liffId = FL_FULL_PAGES.includes(page) ? cfg.liffFull : cfg.liffCompact;
    if (!liffId || !window.liff) return;
    try {
      await liff.init({ liffId });
      FL.inLiff = true;
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return 'redirect'; }
      FL.token = liff.getAccessToken();
    } catch (e) {
      console.error('LIFF init failed', e);
    }
  }

  FL.api = async (action, body) => {
    if (!FL.token) throw Object.assign(new Error('請從 LINE 官方帳號選單開啟此頁面。'), { code: 'FL_NO_TOKEN' });
    let res;
    try {
      res = await fetch(`${cfg.apiBase}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FL.token}` },
        body: JSON.stringify(body || {}),
      });
    } catch {
      throw new Error('網路連線失敗，請確認網路後重試。');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || '伺服器暫時無法處理，請稍後再試。'), { code: data.error });
    return data;
  };

  FL.close = () => { if (FL.inLiff && liff.isInClient()) liff.closeWindow(); else location.search = ''; };

  FL.pages.home = () => {
    const links = ['health', 'finance', 'profile', 'contact']
      .map((p) => `<a class="fl-btn ${p === 'health' ? '' : 'fl-secondary'}" href="?p=${p}">${FL_TITLES[p]}</a>`).join('');
    FL.render(`<div class="fl-card"><h2>歡迎使用 AI專注訓練器</h2>
      <p class="fl-muted">請選擇功能。建議從 LINE 官方帳號下方選單開啟，結果會自動保存到你的帳號。</p></div>
      <div class="fl-home">${links}</div>`);
  };

  FL.start = async () => {
    const page = flPage();
    document.getElementById('fl-title').textContent = FL_TITLES[page];
    document.title = `${FL_TITLES[page]}｜AI專注訓練器`;
    if ((await flInitLiff(page)) === 'redirect') return;
    FL.pages[page]();
  };
})();
