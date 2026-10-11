// 個人資訊填寫（全頁）＋ 聯絡專員
(function () {
  const FL = window.FL;
  const cfg = window.FL_CONFIG;
  const FL_SECTIONS = [
    ['基本資料', [
      ['name', '姓名', 'text'], ['age', '年齡', 'number'], ['job', '職業', 'text'],
      ['family', '家庭狀況', 'select', ['單身', '已婚無子女', '已婚有子女', '其他']],
    ]],
    ['每月收支（新台幣）', [
      ['income_main', '主要收入', 'number'], ['income_other', '其他收入', 'number'],
      ['expense_fixed', '固定支出（房租、保費等）', 'number'], ['expense_var', '變動支出（餐費、娛樂等）', 'number'],
    ]],
    ['資產（新台幣）', [
      ['asset_cash', '存款', 'number'], ['asset_invest', '股票／基金／ETF', 'number'],
      ['asset_property', '不動產市值', 'number'], ['asset_other', '其他資產', 'number'],
    ]],
    ['負債（新台幣）', [
      ['debt_mortgage', '房貸餘額', 'number'], ['debt_car', '車貸餘額', 'number'],
      ['debt_credit', '信貸／卡債', 'number'], ['debt_monthly', '每月還款總額', 'number'],
    ]],
    ['保障與規劃', [
      ['insurance', '已投保項目', 'chips', ['壽險', '醫療險', '意外險', '重大疾病險', '長照險', '儲蓄險']],
      ['emergency_months', '緊急預備金可支撐月數', 'number'],
      ['risk', '投資風險偏好', 'select', ['保守', '穩健', '積極']],
      ['goal', '未來 5 年財務目標', 'textarea'],
    ]],
  ];

  function flField([key, label, type, opts], data) {
    const v = data[key];
    let input;
    if (type === 'select') {
      input = `<select name="${key}"><option value="">請選擇</option>${opts.map((o) => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    } else if (type === 'chips') {
      const set = Array.isArray(v) ? v : [];
      input = `<div class="fl-chips">${opts.map((o) => `<label><input type="checkbox" name="${key}" value="${o}" ${set.includes(o) ? 'checked' : ''}>${o}</label>`).join('')}</div>`;
    } else if (type === 'textarea') {
      input = `<textarea name="${key}" rows="3" maxlength="500">${FL.esc(v)}</textarea>`;
    } else {
      const extra = type === 'number' ? 'inputmode="numeric" min="0" max="9999999999"' : 'maxlength="50"';
      input = `<input type="${type}" name="${key}" value="${FL.esc(v)}" ${extra}>`;
    }
    return `<div class="fl-field"><label>${label}</label>${input}</div>`;
  }

  function flCollect(form) {
    const data = {};
    FL_SECTIONS.forEach(([, fields]) => fields.forEach(([key, , type]) => {
      if (type === 'chips') {
        data[key] = [...form.querySelectorAll(`input[name="${key}"]:checked`)].map((i) => i.value);
      } else {
        const el = form.elements[key];
        const val = el.value.trim();
        if (val === '') return;
        data[key] = type === 'number' ? Math.max(0, Number(val)) : val;
      }
    }));
    return data;
  }

  function flForm(data) {
    FL.render(`<form id="fl-form">${FL_SECTIONS.map(([title, fields]) =>
      `<div class="fl-card"><h2>${title}</h2>${fields.map((f) => flField(f, data)).join('')}</div>`).join('')}
      <p class="fl-muted">資料僅用於提供你個人化的財務建議，可隨時修改。</p>
      <button class="fl-btn" type="submit" id="fl-save">儲存</button></form>`);
    const form = document.getElementById('fl-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('fl-save');
      btn.disabled = true; btn.textContent = '儲存中…';
      try { await FL.api('profile', { data: flCollect(form) }); FL.toast('已儲存'); }
      catch (err) { FL.toast(err.message); }
      btn.disabled = false; btn.textContent = '儲存';
    };
  }

  FL.pages.profile = async () => {
    FL.loading('讀取資料中…');
    let data = {};
    try { data = (await FL.api('profile', {})).data || {}; }
    catch (e) { FL.toast(e.message); }
    flForm(data);
  };

  FL.pages.contact = () => {
    FL.render(`<div class="fl-card fl-center"><h2>聯絡專員</h2>
      <p>有任何健康、專注力或財務規劃的問題，歡迎直接與專員一對一聊聊。</p>
      <p class="fl-muted">服務時間：週一至週五 10:00–18:00</p>
      <a class="fl-btn" id="fl-line" href="${FL.esc(cfg.contactUrl || '#')}">跳出LINE</a></div>`);
    document.getElementById('fl-line').onclick = (e) => {
      if (!cfg.contactUrl) { e.preventDefault(); FL.toast('專員連結即將開放'); return; }
      if (FL.inLiff && liff.isInClient()) { e.preventDefault(); liff.openWindow({ url: cfg.contactUrl, external: false }); }
    };
  };
})();
