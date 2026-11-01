/* ==================================================================
   프롬프트 만들기 탭
   양식(templates.js) → 입력 화면 자동 생성 → 구조화된 프롬프트 조립
   ================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const PRESET_KEY = 'ssoda.presets.v1';
  const SOURCE_LIMIT = 60000;

  const state = {
    tplId: TEMPLATES[0].id,
    values: {},                                // 양식별 입력값 { tplId: { fieldId: value } }
    ctx: { level: '', grade: '', subject: '' }, // 공통 수업 정보 (양식을 바꿔도 유지)
    source: { name: '', text: '' },             // 참고 자료
  };

  const tpl = () => TEMPLATES.find(t => t.id === state.tplId);
  const vals = () => (state.values[state.tplId] ||= {});

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k);
    return n;
  }

  /* ---------- 양식 목록 ---------- */
  function renderList() {
    const box = $('tplList');
    box.innerHTML = '';
    for (const c of TEMPLATE_CATEGORIES) {
      const items = TEMPLATES.filter(t => t.cat === c.id);
      box.append(el('div', { class: 'tpl-cat' }, `${c.icon} ${c.name}`));
      for (const t of items) {
        box.append(el('button', {
          class: 'tpl-item' + (t.id === state.tplId ? ' active' : ''),
          onclick: () => { state.tplId = t.id; renderList(); renderForm(); update(); },
        }, el('span', { class: 'tpl-ic' }, t.icon), el('span', {}, t.name)));
      }
    }
  }

  /* ---------- 입력 화면 ---------- */
  function chipGroup(options, isOn, onPick) {
    const g = el('div', { class: 'chips' });
    for (const o of options) {
      g.append(el('button', { type: 'button', class: 'chip' + (isOn(o) ? ' on' : ''),
        onclick: (e) => { onPick(o); syncChips(g, isOn); update(); e.preventDefault(); } }, o));
    }
    return g;
  }
  function syncChips(g, isOn) {
    g.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', isOn(c.textContent)));
  }

  function fieldInput(f, store) {
    const v = store[f.id];
    const set = (val) => { store[f.id] = val; update(); };
    switch (f.type) {
      case 'textarea':
        return el('textarea', { class: 'in', rows: 3, placeholder: f.ph || '', oninput: (e) => set(e.target.value) }, v || '');
      case 'select': {
        const s = el('select', { class: 'in', onchange: (e) => set(e.target.value) },
          el('option', { value: '' }, '선택 안 함'), ...f.options.map(o => el('option', { value: o }, o)));
        s.value = v || '';
        return s;
      }
      case 'chips':
        return chipGroup(f.options, (o) => store[f.id] === o, (o) => { store[f.id] = store[f.id] === o ? '' : o; });
      case 'multi':
        return chipGroup(f.options, (o) => (store[f.id] || []).includes(o), (o) => {
          const arr = store[f.id] || [];
          store[f.id] = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o];
        });
      default:
        return el('input', { class: 'in', type: 'text', placeholder: f.ph || '', value: v || '', oninput: (e) => set(e.target.value) });
    }
  }

  function renderForm() {
    const t = tpl();
    const form = $('tplForm');
    form.innerHTML = '';

    form.append(el('div', { class: 'form-h' },
      el('div', { class: 'form-ic' }, t.icon),
      el('div', {}, el('div', { class: 'form-t' }, t.name), el('div', { class: 'form-d' }, t.desc))));

    // 저장한 설정
    const presets = loadPresets()[t.id] || [];
    const pbar = el('div', { class: 'presets' },
      el('button', { class: 'btn btn-sm', type: 'button', onclick: savePreset }, '⭐ 지금 입력 저장'));
    presets.forEach((p, i) => pbar.append(el('span', { class: 'preset' },
      el('button', { type: 'button', class: 'preset-n', title: '불러오기', onclick: () => applyPreset(p) }, p.name),
      el('button', { type: 'button', class: 'preset-x', title: '삭제', onclick: () => deletePreset(i) }, '×'))));
    form.append(pbar);

    if (t.privacy) {
      form.append(el('div', { class: 'note warn' },
        '🔒 학생 이름·번호·연락처는 넣지 말고 "학생A"처럼 바꿔 적어 주세요. AI 서비스에 입력한 내용은 외부로 전송됩니다.'));
    }

    // 공통 수업 정보
    if (t.context) {
      const c = state.ctx;
      form.append(el('fieldset', { class: 'ctx' },
        el('legend', {}, '수업 정보 (선택 · 모든 양식에 공통)'),
        chipGroup(['초등학교', '중학교', '고등학교'], (o) => c.level === o, (o) => { c.level = c.level === o ? '' : o; }),
        el('div', { class: 'row2' },
          el('input', { class: 'in', placeholder: '학년 (예: 2학년)', value: c.grade, oninput: (e) => { c.grade = e.target.value; update(); } }),
          el('input', { class: 'in', placeholder: '과목 (예: 과학)', value: c.subject, oninput: (e) => { c.subject = e.target.value; update(); } }))));
    }

    const store = vals();
    for (const f of t.fields) {
      form.append(el('div', { class: 'field' },
        el('label', { class: 'lbl' }, f.label, f.required ? el('span', { class: 'req' }, ' *') : null),
        fieldInput(f, store)));
    }

    if (t.source) renderSource(form, t);
  }

  /* ---------- 참고 자료 ---------- */
  function renderSource(form, t) {
    const s = state.source;
    const count = el('span', { class: 'src-count' });
    const ta = el('textarea', { class: 'in src-ta', rows: 6,
      placeholder: '여기에 자료를 붙여 넣거나, 문서 → 마크다운 탭에서 보내 주세요.',
      oninput: (e) => { s.text = e.target.value; if (!s.text) s.name = ''; showCount(); update(); } }, s.text);
    const showCount = () => {
      count.textContent = s.text ? `${s.name ? s.name + ' · ' : ''}${s.text.length.toLocaleString()}자` : '';
      count.classList.toggle('over', s.text.length > SOURCE_LIMIT);
    };
    showCount();
    form.append(el('div', { class: 'field src' },
      el('label', { class: 'lbl' }, '📎 참고 자료', t.source === 'required' ? el('span', { class: 'req' }, ' *') : ' (선택)', count),
      ta,
      el('div', { class: 'src-actions' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => SSODA.goTab('convert') }, '📄 문서에서 가져오기'),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { s.text = ''; s.name = ''; ta.value = ''; showCount(); update(); } }, '비우기'))));
  }

  /* ---------- 프롬프트 조립 ---------- */
  const fmt = (v) => Array.isArray(v) ? v.join(', ') : (v || '').trim();

  function build(splitSource = false) {
    const t = tpl(), v = vals(), c = state.ctx;
    const missing = [];
    const L = [];
    L.push('# 역할', t.role, '');
    L.push('# 요청', t.task, '');

    if (t.context) {
      const ctx = [c.level && `- 학교급: ${c.level}`, c.grade.trim() && `- 학년: ${c.grade.trim()}`, c.subject.trim() && `- 과목: ${c.subject.trim()}`].filter(Boolean);
      if (ctx.length) L.push('# 수업 정보', ...ctx, '');
    }

    const cond = [];
    for (const f of t.fields) {
      const val = fmt(v[f.id]);
      if (!val) { if (f.required) missing.push(f.label); continue; }
      cond.push(val.includes('\n') ? `- ${f.label}:\n${val.split('\n').map(x => '  ' + x).join('\n')}` : `- ${f.label}: ${val}`);
    }
    if (cond.length) L.push('# 세부 조건', ...cond, '');

    const rules = [...(t.rules || [])];
    if (t.textRule) rules.push(t.textRule(v));
    if (rules.length) L.push('# 꼭 지켜 주세요', ...rules.map(r => '- ' + r), '');
    if (t.output) L.push('# 결과 형식', t.output, '');

    const src = state.source.text.trim();
    if (t.source && src && splitSource) {
      L.push('# 참고 자료', '앞에서 여러 번에 나눠 보낸 자료 전체를 바탕으로 작성해 주세요.' + (state.source.name ? ` (출처: ${state.source.name})` : ''));
    } else if (t.source && src) {
      L.push('# 참고 자료', '아래 """ 사이의 자료를 바탕으로 작성해 주세요.' + (state.source.name ? ` (출처: ${state.source.name})` : ''), '"""', src, '"""');
    } else if (t.source === 'required') {
      missing.push('참고 자료');
    }
    return { text: L.join('\n').trim(), missing };
  }

  /* ---------- 개인정보 점검 ---------- */
  const PII = [
    [/\b\d{6}\s?-\s?[1-4]\d{6}\b/, '주민등록번호'],
    [/\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/, '휴대전화 번호'],
    [/[\w.+-]+@[\w-]+\.[\w.]+/, '이메일 주소'],
    [/\b\d{1,2}학년\s?\d{1,2}반\s?\d{1,2}번\b/, '학년·반·번호'],
  ];
  function piiFound(text) {
    return PII.filter(([re]) => re.test(text)).map(([, name]) => name);
  }

  /* ---------- 결과 갱신 ---------- */
  function update() {
    const { text, missing } = build();
    const long = text.length > SPLIT_HINT;
    $('splitHint').textContent = long ? `프롬프트가 ${text.length.toLocaleString()}자로 길어요. 한 번에 안 들어가면 나눠 보내세요.` : '';
    $('splitBox').classList.toggle('long', long);
    if ($('splitBox').open) renderSplit();
    $('promptOut').value = text;
    $('promptLen').textContent = `${text.length.toLocaleString()}자`;

    const notes = $('promptNotes');
    notes.innerHTML = '';
    if (missing.length) notes.append(el('div', { class: 'note' }, `✍️ 아직 비어 있어요: ${missing.join(', ')}`));
    const pii = piiFound(text);
    if (pii.length) notes.append(el('div', { class: 'note err' }, `⚠️ 개인정보로 보이는 내용이 있어요: ${pii.join(', ')}. 지우거나 바꾼 뒤 사용하세요.`));
    if (state.source.text.length > SOURCE_LIMIT && tpl().source) {
      notes.append(el('div', { class: 'note warn' }, '📏 참고 자료가 매우 길어요. AI 채팅창에 다 들어가지 않을 수 있으니 필요한 부분만 남기세요.'));
    }
  }

  /* ---------- 나눠 보내기 ---------- */
  const SPLIT_HINT = 12000;
  // 문단 → 줄 → 글자 순으로, size 이하 조각으로 자른다
  function chunk(text, size) {
    const parts = [];
    let cur = '';
    const push = () => { if (cur.trim()) parts.push(cur.trim()); cur = ''; };
    // 제목 줄은 바로 다음 문단과 붙여서, 조각 끝에 제목만 남지 않게
    const paras = [];
    for (const para of text.split(/\n{2,}/)) {
      const prev = paras[paras.length - 1];
      if (prev !== undefined && /^#{1,6}\s/.test(prev) && !prev.includes('\n')) paras[paras.length - 1] = prev + '\n\n' + para;
      else paras.push(para);
    }
    for (const para of paras) {
      const piece = para + '\n\n';
      if (cur.length + piece.length <= size) { cur += piece; continue; }
      push();
      if (piece.length <= size) { cur = piece; continue; }
      for (const line of para.split('\n')) {
        if (cur.length + line.length + 1 > size) push();
        if (line.length > size) { for (let i = 0; i < line.length; i += size) parts.push(line.slice(i, i + size)); continue; }
        cur += line + '\n';
      }
      push();
    }
    push();
    return parts;
  }

  function splitMessages(size) {
    const src = state.source.text.trim();
    const hasSrc = !!(tpl().source && src);
    const { text: request, missing } = build(hasSrc);
    const body = hasSrc ? src : request;
    const pieces = chunk(body, size);
    const n = pieces.length;
    const msgs = pieces.map((c, i) => {
      const head = i === 0
        ? `지금부터 ${hasSrc ? '자료' : '요청'}를 ${n}번에 나눠 보낼게요. 모두 받을 때까지는 내용을 정리하거나 답하지 말고 "받았어요 (번호/${n})"라고만 답해 주세요.\n\n`
        : '';
      return `${head}[${i + 1}/${n}]\n${c}\n\n[${i + 1}/${n} 끝] "받았어요 (${i + 1}/${n})"라고만 답해 주세요.`;
    });
    msgs.push(hasSrc
      ? `이제 자료를 모두(${n}개) 보냈어요. 아래 요청대로 작성해 주세요.\n\n${request}`
      : `이제 요청을 모두(${n}개) 보냈어요. [1/${n}]부터 [${n}/${n}]까지를 이어서 하나의 요청으로 보고 작성해 주세요.`);
    return { msgs, missing };
  }

  function renderSplit() {
    const box = $('splitParts');
    const { msgs, missing } = splitMessages(Number($('splitSize').value));
    box.innerHTML = '';
    if (missing.length) { box.append(el('div', { class: 'note' }, `✍️ 먼저 채워 주세요: ${missing.join(', ')}`)); return; }
    msgs.forEach((m, i) => {
      const last = i === msgs.length - 1;
      const b = el('button', { type: 'button', class: 'split-btn' + (last ? ' last' : ''),
        onclick: async () => {
          const ok = await SSODA.copy(m);
          if (ok) b.classList.add('done');
          SSODA.toast(ok ? `${i + 1}번째를 복사했어요. AI 채팅창에 붙여 넣으세요` : '복사하지 못했어요');
        } },
        el('span', { class: 'split-n' }, last ? '✅ 마지막: 요청' : `${i + 1} / ${msgs.length - 1}`),
        el('span', { class: 'split-len' }, `${m.length.toLocaleString()}자`));
      box.append(b);
    });
  }

  /* ---------- 후속 요청 ---------- */
  const FOLLOW_UPS = [
    ['더 쉽게', '방금 결과를 학생이 이해하기 쉬운 말로 다시 써 주세요. 어려운 낱말은 풀어서 써 주세요.'],
    ['표로 정리', '방금 결과의 핵심을 마크다운 표로 정리해 주세요.'],
    ['절반으로 줄이기', '방금 결과를 핵심만 남겨 분량을 절반 정도로 줄여 주세요.'],
    ['더 자세히', '방금 결과를 예시와 설명을 더해 더 자세히 써 주세요.'],
    ['사실 점검', '방금 결과에서 사실과 다르거나 확인이 필요한 내용이 있는지 점검하고, 고친 부분을 표시해 주세요.'],
    ['다른 버전 2개', '같은 조건으로 느낌이 다른 버전을 2개 더 만들어 주세요.'],
    ['말투 바꾸기', '방금 결과를 학부모에게 보내는 정중한 말투로 바꿔 주세요.'],
    ['마크다운으로', '방금 결과를 다른 설명 없이 마크다운 형식으로만 다시 주세요. (제목은 #, 목록은 -, 표는 마크다운 표)'],
  ];
  function renderFollowUps() {
    const box = $('followChips');
    for (const [label, text] of FOLLOW_UPS) {
      box.append(el('button', { type: 'button', class: 'chip', title: text,
        onclick: async () => SSODA.toast(await SSODA.copy(text) ? `"${label}" 요청을 복사했어요` : '복사하지 못했어요') }, label));
    }
  }

  async function copyPrompt() {
    const { text, missing } = build();
    if (missing.length) { SSODA.toast(`먼저 채워 주세요: ${missing.join(', ')}`); return false; }
    const ok = await SSODA.copy(text);
    SSODA.toast(ok ? '✨ 프롬프트를 복사했어요. AI 채팅창에 붙여 넣으세요' : '복사하지 못했어요. 상자에서 직접 복사해 주세요');
    return ok;
  }

  /* ---------- 저장한 설정 ---------- */
  function loadPresets() {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || {}; } catch (e) { return {}; }
  }
  function storePresets(p) {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function savePreset() {
    const name = (window.prompt('저장할 이름을 적어 주세요', tpl().name) || '').trim();
    if (!name) return;
    const all = loadPresets();
    (all[state.tplId] ||= []).push({ name, values: JSON.parse(JSON.stringify(vals())), ctx: { ...state.ctx } });
    SSODA.toast(storePresets(all) ? '⭐ 저장했어요 (이 브라우저에만 보관)' : '저장하지 못했어요');
    renderForm();
  }
  function applyPreset(p) {
    state.values[state.tplId] = JSON.parse(JSON.stringify(p.values));
    if (p.ctx) state.ctx = { ...p.ctx };
    renderForm(); update();
    SSODA.toast(`"${p.name}" 설정을 불러왔어요`);
  }
  function deletePreset(i) {
    const all = loadPresets();
    const p = (all[state.tplId] || [])[i];
    if (!p || !window.confirm(`"${p.name}" 저장 설정을 지울까요?`)) return;
    all[state.tplId].splice(i, 1);
    storePresets(all); renderForm();
  }

  /* ---------- 외부에서 자료 받기 (PDF 변환 탭) ---------- */
  function attachSource(name, text) {
    state.source = { name, text };
    if (!tpl().source) state.tplId = 'doc2class';
    renderList(); renderForm(); update();
  }

  /* ---------- 시작 ---------- */
  $('btnPromptCopy').addEventListener('click', copyPrompt);
  $('linkToHwp').addEventListener('click', (e) => { e.preventDefault(); SSODA.goTab('tohwp'); });
  document.querySelectorAll('[data-ai]').forEach(a => a.addEventListener('click', async (e) => {
    // 복사 먼저, 그다음 새 창 열기
    e.preventDefault();
    const win = window.open('about:blank', '_blank');
    const ok = await copyPrompt();
    if (ok && win) win.location.href = a.href; else if (win) win.close();
  }));
  $('btnPromptReset').addEventListener('click', () => {
    state.values[state.tplId] = {};
    renderForm(); update();
  });

  $('splitBox').addEventListener('toggle', () => { if ($('splitBox').open) renderSplit(); });
  $('splitSize').addEventListener('change', renderSplit);
  renderFollowUps();
  renderList(); renderForm(); update();
  window.SSODA_PROMPT = { attachSource };
})();
