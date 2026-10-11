// 健康檢測：同意 → 拍臉 → 拍舌 → AI 觀察 → 後端計分 → 報告
(function () {
  const FL = window.FL;
  const FL_BLOCK_NAMES = { face: '臉部', tongue: '舌部', eye: '眼部' };
  const FL_DISCLAIMER = '僅供一般健康參考，不能取代醫師診斷。若有急性症狀（呼吸困難、胸痛、意識異常等），請立即就醫或撥打 119。';
  const state = { face: null, tongue: null, consent: false };

  // 縮放至寬 800、JPEG 品質 0.75
  function flResize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 800 / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取照片，請重新拍攝。')); };
      img.src = url;
    });
  }

  function flSteps(n) {
    return `<div class="fl-steps">${[1, 2, 3, 4].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
  }

  function flConsent() {
    FL.render(`${flSteps(1)}<div class="fl-card"><h2>影像使用說明</h2>
      <p>本功能會請你拍攝<b>臉部</b>與<b>舌部</b>照片，由 AI 觀察 15 項外觀指標並產生健康參考分數。</p>
      <ul class="fl-muted">
        <li>用途：僅用於本次外觀觀察與分數計算。</li>
        <li>保存：<b>不保存原始照片</b>，分析完成即丟棄；只保存分數與文字摘要。</li>
        <li>刪除：可隨時透過「聯絡專員」申請刪除你的紀錄。</li>
      </ul>
      <div class="fl-disclaimer">${FL_DISCLAIMER}</div>
      <label class="fl-check"><input type="checkbox" id="fl-agree"> 我已了解並同意上述影像使用方式</label>
      <button class="fl-btn" id="fl-next" disabled>同意並開始拍攝</button></div>`);
    const agree = document.getElementById('fl-agree');
    const next = document.getElementById('fl-next');
    agree.onchange = () => { next.disabled = !agree.checked; };
    next.onclick = () => { state.consent = true; flShoot('face'); };
  }

  function flShoot(kind) {
    if (!state.consent) return flConsent(); // 未同意不啟動相機
    const isFace = kind === 'face';
    const tip = isFace
      ? '請在光線充足處，正面拍攝素顏臉部，雙眼張開、不戴眼鏡。'
      : '請張口伸出舌頭，在自然光下拍攝，避免剛吃完有色食物。';
    FL.render(`${flSteps(isFace ? 2 : 3)}<div class="fl-card"><h2>拍攝${isFace ? '臉部' : '舌部'}</h2>
      <p class="fl-muted">${tip}</p>
      ${state[kind] ? `<img class="fl-preview" src="${state[kind]}" alt="預覽">` : ''}
      <input type="file" accept="image/*" capture="${isFace ? 'user' : 'environment'}" id="fl-file" hidden>
      <button class="fl-btn ${state[kind] ? 'fl-secondary' : ''}" id="fl-cam">${state[kind] ? '重新拍攝' : '開啟相機'}</button>
      ${state[kind] ? `<button class="fl-btn" id="fl-ok">${isFace ? '下一步：拍攝舌部' : '送出分析'}</button>` : ''}
      <p class="fl-muted">若無法開啟相機，請到手機設定允許 LINE 使用相機，或改選相簿照片。</p></div>`);
    const file = document.getElementById('fl-file');
    document.getElementById('fl-cam').onclick = () => file.click();
    file.onchange = async () => {
      if (!file.files[0]) return;
      try { state[kind] = await flResize(file.files[0]); flShoot(kind); } catch (e) { FL.toast(e.message); }
    };
    const ok = document.getElementById('fl-ok');
    if (ok) ok.onclick = () => (isFace ? flShoot('tongue') : flSubmit());
  }

  async function flSubmit() {
    if (!state.face) return flShoot('face');
    if (!state.tongue) return flShoot('tongue');
    FL.loading('AI 正在觀察照片，約需 10–20 秒…');
    try {
      const r = await FL.api('health', { face: state.face, tongue: state.tongue });
      state.face = state.tongue = null; // 前端也不保留照片
      flReport(r);
    } catch (e) {
      if (e.code === 'FL_BAD_IMAGE' || e.code === 'FL_NO_SCORES') {
        FL.errorView(e.message, () => { state.face = state.tongue = null; flShoot('face'); });
      } else {
        FL.errorView(e.message, flSubmit);
      }
    }
  }

  function flRing(total) {
    const r = 62, c = 2 * Math.PI * r, off = c * (1 - total / 100);
    return `<svg class="fl-ring" viewBox="0 0 150 150" role="img" aria-label="總分 ${total}">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="#E3E8EE" stroke-width="12"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="#2EC4B6" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 75 75)"/>
      <text x="75" y="82" text-anchor="middle" font-size="36" font-weight="700" fill="#1E3A5F">${total}</text>
      <text x="75" y="104" text-anchor="middle" font-size="12" fill="#6B7785">/ 100</text></svg>`;
  }

  function flBar(label, v, max) {
    const pct = v == null ? 0 : (v / max) * 100;
    return `<div class="fl-bar"><span class="fl-label">${FL.esc(label)}</span>
      <span class="fl-track"><span class="fl-fill" style="width:${pct}%"></span></span>
      <span class="fl-val">${v == null ? '—' : v}</span></div>`;
  }

  function flReport(r) {
    const blocks = ['face', 'tongue', 'eye'].map((b) => {
      const bd = r.breakdown[b];
      const items = Object.entries(bd.items).map(([k, v]) => flBar(k, v, 10)).join('');
      const note = r.notes && r.notes[b] ? `<p class="fl-muted">${FL.esc(r.notes[b])}</p>` : '';
      return `<div class="fl-card"><h2>${FL_BLOCK_NAMES[b]}　${bd.score == null ? '—' : Math.round(bd.score * 10)} 分</h2>${items}${note}</div>`;
    }).join('');
    const tasks = (r.tasks || []).map((t) => `<li>${FL.esc(t)}</li>`).join('');
    FL.render(`${flSteps(4)}
      ${r.urgent ? '<div class="fl-alert">照片中可能有需要留意的狀況，請盡快諮詢醫師；若有急性不適，請立即就醫。</div>' : ''}
      <div class="fl-card fl-center"><h2>健康參考總分</h2>${flRing(r.total)}
        <p>${FL.esc(r.summary)}</p></div>
      ${blocks}
      ${tasks ? `<div class="fl-card"><h2>14 天可執行任務</h2><ol class="fl-tasks">${tasks}</ol></div>` : ''}
      <div class="fl-disclaimer">${FL_DISCLAIMER}</div><br>
      <button class="fl-btn fl-secondary" id="fl-again">重新檢測</button>
      <button class="fl-btn" id="fl-close">完成</button>`);
    document.getElementById('fl-again').onclick = flConsent;
    document.getElementById('fl-close').onclick = FL.close;
  }

  FL.pages.health = flConsent;
  FL._healthReport = flReport; // 測試用
})();
