// 財務健康度檢測：心理測驗式 10 題 → 5 維度雷達圖
(function () {
  const FL = window.FL;
  // 維度：flexibility 財務彈性 / stress 可承受壓力 / roi 投資回報 / health 資產健康 / growth 資產成長
  const FL_DIMS = [
    ['flexibility', '財務彈性度'], ['stress', '可承受壓力度'], ['roi', '投資回報程度'],
    ['health', '資產健康程度'], ['growth', '資產成長度'],
  ];
  // 每個選項 s：對各維度加分（0–3）
  const FL_QS = [
    { q: '月底打開帳戶，你最常看到的畫面是？', o: [
      ['還剩不少，自動轉去存起來', { flexibility: 3, health: 2 }],
      ['剛好打平，有點緊但還行', { flexibility: 1, health: 1 }],
      ['常常得刷卡撐到發薪日', { flexibility: 0, health: 0 }],
      ['我其實不太清楚', { flexibility: 1 }]] },
    { q: '如果明天突然少了一份收入，你能撐多久？', o: [
      ['6 個月以上，完全不慌', { stress: 3, flexibility: 2 }],
      ['3–6 個月', { stress: 2, flexibility: 1 }],
      ['1–2 個月', { stress: 1 }],
      ['不到 1 個月', { stress: 0 }]] },
    { q: '朋友推薦一檔「保證月領 2%」的投資，你會？', o: [
      ['先查清楚，保證高報酬通常有問題', { roi: 2, health: 2 }],
      ['小額試試看', { roi: 1 }],
      ['馬上投入，機會難得', { roi: 0, health: 0 }],
      ['我不碰投資', { roi: 0, health: 1 }]] },
    { q: '你的錢主要放在哪裡？', o: [
      ['分散在存款、ETF、保險等多個地方', { roi: 3, health: 3, growth: 2 }],
      ['大部分是定存或活存', { roi: 1, health: 2 }],
      ['集中在一兩檔股票或幣', { roi: 2, health: 0, growth: 1 }],
      ['幾乎沒有存款', { health: 0 }]] },
    { q: '過去一年，你的總資產變化是？', o: [
      ['明顯增加', { growth: 3 }], ['小幅增加', { growth: 2 }],
      ['差不多', { growth: 1 }], ['變少了', { growth: 0 }]] },
    { q: '每月的負債還款（房貸、車貸、卡費）大約佔收入多少？', o: [
      ['幾乎沒有', { stress: 3, health: 3 }], ['三成以下', { stress: 2, health: 2 }],
      ['三到五成', { stress: 1, health: 1 }], ['超過五成', { stress: 0, health: 0 }]] },
    { q: '市場大跌 20%，你的第一個反應是？', o: [
      ['照計畫定期定額，甚至加碼', { stress: 3, roi: 3, growth: 2 }],
      ['有點緊張，但不動作', { stress: 2, roi: 2 }],
      ['趕快賣掉止血', { stress: 0, roi: 0 }],
      ['我沒有投資，沒感覺', { stress: 1 }]] },
    { q: '你多久檢視一次自己的財務狀況？', o: [
      ['每月固定', { health: 3, growth: 2, flexibility: 1 }], ['每季或半年', { health: 2, growth: 1 }],
      ['想到才看', { health: 1 }], ['幾乎不看', { health: 0 }]] },
    { q: '如果有一筆 10 萬元的意外收入，你會？', o: [
      ['一部分當緊急預備金，一部分投資', { flexibility: 3, growth: 3, roi: 2 }],
      ['全部存起來', { flexibility: 2, growth: 1 }],
      ['先還債', { health: 2, stress: 1 }],
      ['犒賞自己，買想要的東西', { flexibility: 0, growth: 0 }]] },
    { q: '未來五年，你有明確的財務目標嗎？', o: [
      ['有，而且有具體數字和計畫', { growth: 3, roi: 1, flexibility: 1 }],
      ['有方向，但沒寫下來', { growth: 2 }],
      ['想過但很模糊', { growth: 1 }],
      ['沒有', { growth: 0 }]] },
  ];
  const FL_ADVICE = {
    flexibility: ['先建立 1 個月生活費的緊急預備金，再自動化每月儲蓄。', '彈性不錯，可將預備金補到 6 個月。', '財務彈性很好，保持自動化儲蓄習慣。'],
    stress: ['負債或收入集中度偏高，優先降低高利負債。', '可再分散收入來源，並檢查保險保障。', '抗壓力強，即使突發狀況也有緩衝。'],
    roi: ['先從低成本、分散的指數型工具開始學習。', '已有投資概念，可檢視費用率與資產配置。', '投資思維成熟，留意定期再平衡。'],
    health: ['先做一次完整資產負債盤點，看清全貌。', '資產結構尚可，可再提高分散度。', '資產結構健康，持續定期檢視即可。'],
    growth: ['設定一個具體的 1 年目標金額，拆成每月行動。', '有成長趨勢，可提高定期投入比例。', '資產成長動能強，記得設定階段性目標。'],
  };
  const answers = [];

  function flScore() {
    const max = {}, got = {};
    FL_DIMS.forEach(([d]) => { max[d] = 0; got[d] = 0; });
    FL_QS.forEach((q, i) => {
      FL_DIMS.forEach(([d]) => { max[d] += Math.max(...q.o.map((o) => o[1][d] || 0)); });
      const pick = q.o[answers[i]];
      if (pick) FL_DIMS.forEach(([d]) => { got[d] += pick[1][d] || 0; });
    });
    return Object.fromEntries(FL_DIMS.map(([d]) => [d, max[d] ? Math.round((got[d] / max[d]) * 100) : 0]));
  }

  function flQuestion(i) {
    if (i >= FL_QS.length) return flResult();
    const q = FL_QS[i];
    FL.render(`<div class="fl-steps">${FL_QS.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="fl-card"><p class="fl-muted">第 ${i + 1} / ${FL_QS.length} 題</p><p class="fl-q">${FL.esc(q.q)}</p>
      ${q.o.map((o, k) => `<button class="fl-opt ${answers[i] === k ? 'on' : ''}" data-k="${k}">${FL.esc(o[0])}</button>`).join('')}
      ${i > 0 ? '<button class="fl-btn fl-secondary" id="fl-prev">上一題</button>' : ''}</div>`);
    FL.root().querySelectorAll('.fl-opt').forEach((b) => {
      b.onclick = () => { answers[i] = Number(b.dataset.k); setTimeout(() => flQuestion(i + 1), 150); };
    });
    const prev = document.getElementById('fl-prev');
    if (prev) prev.onclick = () => flQuestion(i - 1);
  }

  function flRadar(scores) {
    const cx = 160, cy = 150, R = 105, n = FL_DIMS.length;
    const pt = (k, r) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const ring = (f) => FL_DIMS.map((_, k) => pt(k, R * f).join(',')).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" stroke="#E3E8EE"/>`).join('');
    const axes = FL_DIMS.map((_, k) => { const [x, y] = pt(k, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#E3E8EE"/>`; }).join('');
    const data = FL_DIMS.map(([d], k) => pt(k, (R * scores[d]) / 100).join(',')).join(' ');
    const labels = FL_DIMS.map(([d, name], k) => {
      const [x, y] = pt(k, R + 24);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#1E3A5F">${name}</text>
        <text x="${x}" y="${y + 14}" text-anchor="middle" font-size="12" font-weight="700" fill="#2EC4B6">${scores[d]}</text>`;
    }).join('');
    return `<svg class="fl-radar" viewBox="0 0 320 310" role="img" aria-label="財務五維雷達圖">${grid}${axes}
      <polygon points="${data}" fill="rgba(46,196,182,.25)" stroke="#2EC4B6" stroke-width="2"/>${labels}</svg>`;
  }

  async function flResult() {
    const scores = flScore();
    const avg = Math.round(FL_DIMS.reduce((s, [d]) => s + scores[d], 0) / FL_DIMS.length);
    const type = avg >= 75 ? '穩健成長型' : avg >= 50 ? '潛力調整型' : '重新出發型';
    const tips = FL_DIMS.map(([d, name]) => {
      const lv = scores[d] >= 70 ? 2 : scores[d] >= 40 ? 1 : 0;
      return `<div class="fl-bar"><span class="fl-label">${name}</span><span class="fl-track"><span class="fl-fill" style="width:${scores[d]}%"></span></span><span class="fl-val">${scores[d]}</span></div>
        <p class="fl-muted" style="margin:0 0 10px">${FL_ADVICE[d][lv]}</p>`;
    }).join('');
    FL.render(`<div class="fl-card fl-center"><h2>你的財務人格：${type}</h2>
      <p class="fl-muted">綜合分數 ${avg} / 100</p>${flRadar(scores)}</div>
      <div class="fl-card"><h2>五大維度建議</h2>${tips}</div>
      <p class="fl-muted" id="fl-save-state">正在保存結果…</p>
      <div class="fl-disclaimer">本測驗僅供自我了解參考，不構成投資建議。</div><br>
      <a class="fl-btn fl-secondary" href="?p=profile">填寫完整財務資料</a>
      <button class="fl-btn" id="fl-redo">重新測驗</button>`);
    document.getElementById('fl-redo').onclick = () => { answers.length = 0; flQuestion(0); };
    const s = document.getElementById('fl-save-state');
    try { await FL.api('finance', { answers: [...answers], scores }); s.textContent = '結果已保存。'; }
    catch (e) { s.textContent = `結果未保存：${e.message}`; }
  }

  FL.pages.finance = () => {
    answers.length = 0;
    FL.render(`<div class="fl-card"><h2>3 分鐘財務健康度檢測</h2>
      <p>不用填任何數字，像心理測驗一樣，憑直覺選擇最接近你的答案。</p>
      <p class="fl-muted">共 10 題，完成後會產生你的財務五維雷達圖：財務彈性、可承受壓力、投資回報、資產健康、資產成長。</p>
      <button class="fl-btn" id="fl-go">開始測驗</button></div>`);
    document.getElementById('fl-go').onclick = () => flQuestion(0);
  };
})();
