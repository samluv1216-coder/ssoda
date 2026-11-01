/* ==================================================================
   개인정보 가리기 → AI → 되돌리기
   - 이름 목록 + 자동 패턴(주민번호·전화·이메일·학년반번호)을 가명으로 바꾼다
   - 누가 누구인지 대응표는 이 브라우저(localStorage)에만 둔다
   - AI 답을 붙여 넣으면 가명을 원래대로 되돌린다
   ================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const MAP_KEY = 'ssoda.privacy.map.v1';

  // 흔한 성씨 (두 글자 성 먼저)
  const SURNAMES = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문',
    ...'김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부'.split('')];
  const PARTICLE = '(?=이가|이는|이를|이의|이와|이랑|이도|이에게|이한테|에게|한테|께서|님|학생|군|양|씨|이|가|은|는|을|를|의|와|과|도|만|랑|[\\s,.)\\]·]|$)';
  // 성씨로 시작하지만 이름이 아닌 흔한 낱말
  const NOT_NAMES = new Set(('이번에 이용을 이용해 이유를 이해를 이후에 이전에 이상의 이야기 이름을 정도로 정도는 정리를 정보를 정확한 조사를 조금씩 전체를 전체의 전화를 안전을 안내를 한국의 한번에 지원을 기본을 고등학 공부를 문제를 문장을 방법을 사용을 주제를 진행을 우리는 우리가 모두가 주의를 서로를 시간을 장소를 수업을 수준의 성취를 성적을 과제를 학교의 학생의 학급의 학년의 교사의 교육을 연락처 이메일 이름은 이름을 주소는 주소를 보호자 정서적 정서가 사회성 성격이 성격을 성격은 기분이 계획을 결과를 내용을 활동을 평가를 참여를 발표를 준비를 상담을 관찰을 태도가 태도를 노력을 노력이 성실히 도움을 도움이 기록을 독서를 가정의 가족과 친구와 친구가 친구를 선생님').split(' '));
  const STOP_END = /[다고며서면요니함음됨임게지네까]$/;
  // 이름 뒤에 붙는 조사 (긴 것부터)
  const JOSA = '이에게|이한테|이가|이는|이를|이의|이와|이랑|이도|이야|으로|에게|한테|은|는|이|가|을|를|과|와|로|아|야|랑|도|의|만|님';

  /* ---------- 받침에 맞춰 조사 고르기 (서연과 → 학생B와) ---------- */
  function batchim(word) {
    const w = word.replace(/[\]\s]+$/, '');
    const ch = w.slice(-1);
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) { const j = (code - 0xAC00) % 28; return j === 0 ? 0 : (j === 8 ? 'ㄹ' : 1); }
    if (/[LlRr]/.test(ch)) return 'ㄹ';
    if (/[MmNn]/.test(ch)) return 1;
    if (/[178]/.test(ch)) return 'ㄹ';
    if (/[036]/.test(ch)) return 1;
    return 0;
  }
  function fitJosa(word, josa) {
    if (!josa) return '';
    const b = batchim(word);
    const EUPHONIC = ['이에게', '이한테', '이가', '이는', '이를', '이의', '이와', '이랑', '이도', '이야'];
    if (!b) {
      if (EUPHONIC.includes(josa)) josa = josa.slice(1);
      return ({ 은: '는', 이: '가', 을: '를', 과: '와', 으로: '로', 아: '야' })[josa] || josa;
    }
    if (EUPHONIC.includes(josa)) return josa;            // 서연이는 → (받침 있는 이름) 그대로
    const m = ({ 는: '은', 가: '이', 를: '을', 와: '과', 야: '아', 랑: '이랑' })[josa];
    if (m) return m;
    if (josa === '로') return b === 'ㄹ' ? '로' : '으로';
    if (josa === '으로') return b === 'ㄹ' ? '로' : '으로';
    return josa;
  }
  // target 을 replacement 로 바꾸면서 뒤따르는 조사도 맞춘다
  function swap(text, pattern, replacement, onHit) {
    const re = new RegExp(`${pattern}(${JOSA})?`, 'g');
    return text.replace(re, (m, j1) => { onHit && onHit(); return replacement + fitJosa(replacement, j1 || ''); });
  }

  const PATTERNS = [
    { key: 'rrn', label: '주민번호', re: /\b\d{6}\s?-\s?[1-4]\d{6}\b/g, tag: '주민번호' },
    { key: 'phone', label: '휴대전화', re: /\b01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, tag: '전화' },
    { key: 'tel', label: '일반전화', re: /\b0(?:2|[3-6][1-5])[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, tag: '전화' },
    { key: 'email', label: '이메일', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, tag: '이메일' },
    { key: 'sno', label: '학년반번호', re: /(?<!\d)\d{1,2}\s?학년\s?\d{1,2}\s?반\s?\d{1,2}\s?번|(?<!\d)\d{5}(?!\d)(?=\s?(?:번|학번))/g, tag: '번호' },
  ];

  /* ---------- 대응표 ---------- */
  function loadMap() {
    try { return JSON.parse(localStorage.getItem(MAP_KEY)) || { items: [] }; } catch (e) { return { items: [] }; }
  }
  function saveMap(m) { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch (e) { /* 무시 */ } }
  let map = loadMap();   // items: [{orig, token, kind}]

  const letters = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  function tokenFor(orig, kind, prefix) {
    const found = map.items.find(x => x.orig === orig);
    if (found) return found.token;
    let token;
    if (kind === 'name') {
      const n = map.items.filter(x => x.kind === 'name').length;
      token = `${prefix}${letters(n)}`;
    } else {
      const n = map.items.filter(x => x.tag === kind).length + 1;
      token = `[${kind}${n}]`;
    }
    map.items.push({ orig, token, kind: kind === 'name' ? 'name' : 'pattern', tag: kind });
    return token;
  }

  /* ---------- 이름 목록 / 후보 ---------- */
  function nameList() {
    return [...new Set($('pvNames').value.split(/[\n,;\t]+/).map(s => s.trim()).filter(s => /^[가-힣A-Za-z]{2,10}$/.test(s)))];
  }
  function suggest(text) {
    const known = new Set(nameList());
    const sur = SURNAMES.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`(?<![가-힣])(?:${sur})[가-힣]{1,2}${PARTICLE}`, 'g');
    const count = new Map();
    for (const m of text.matchAll(re)) {
      let w = m[0];
      if (w.length < 2 || w.length > 4) continue;
      if (NOT_NAMES.has(w) || STOP_END.test(w) || known.has(w)) continue;
      if (w.length === 3 && /[이가은는을를의와과도]$/.test(w) && text.includes(w.slice(0, 2) + ' ') === false && [...known].some(k => k.endsWith(w.slice(0, 2)))) continue;
      if ([...known].some(k => k.endsWith(w.slice(0, 2)) && /[이가은는을를의와과도야]$/.test(w))) continue;
      count.set(w, (count.get(w) || 0) + 1);
    }
    // "김민수"가 후보면 "민수가"(이름+조사)는 빼기
    const words = [...count.keys()];
    const josaTail = (w) => /[이가은는을를의와과도야]$/.test(w);
    return [...count.entries()]
      .filter(([w]) => !(josaTail(w) && words.some(c => c !== w && c.endsWith(w.slice(0, -1)))))
      .filter(([w]) => w.length === 3 || count.get(w) > 1)
      .sort((a, b) => b[1] - a[1]).slice(0, 20);
  }
  function renderSuggest() {
    const box = $('pvSuggest');
    box.innerHTML = '';
    const list = suggest($('pvIn').value);
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    box.append(Object.assign(document.createElement('span'), { className: 'pv-sg-l', textContent: '이름 같아요 (눌러서 추가):' }));
    for (const [w, n] of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = n > 1 ? `${w} ×${n}` : w;
      b.onclick = () => {
        const cur = $('pvNames').value.trim();
        $('pvNames').value = (cur ? cur + '\n' : '') + w;
        mask();
      };
      box.append(b);
    }
  }

  /* ---------- 가리기 ---------- */
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function mask() {
    let text = $('pvIn').value;
    const prefix = ($('pvPrefix').value.trim() || '학생');
    const names = nameList().sort((a, b) => b.length - a.length);
    const counts = {};

    // 1) 자동 패턴
    for (const p of PATTERNS) {
      if (!$('pv_' + p.key).checked) continue;
      const re = new RegExp(`(?:${p.re.source})(${JOSA})?`, 'g');
      text = text.replace(re, (m, j) => {
        counts[p.label] = (counts[p.label] || 0) + 1;
        const orig = j ? m.slice(0, -j.length) : m;
        const tok = tokenFor(orig.trim(), p.tag, prefix);
        return tok + fitJosa(tok, j || '');
      });
    }
    // 2) 이름 (성+이름 → 가명)
    for (const n of names) {
      const tok = tokenFor(n, 'name', prefix);
      text = swap(text, escRe(n), tok, () => { counts['이름'] = (counts['이름'] || 0) + 1; });
    }
    // 3) 이름만 부른 경우 (김민수 → "민수야", "민수가")
    if ($('pvGiven').checked) {
      for (const n of names) {
        if (n.length < 3 || !/^[가-힣]+$/.test(n)) continue;
        const given = n.length === 4 && SURNAMES.includes(n.slice(0, 2)) ? n.slice(2) : n.slice(1);
        if (given.length < 2) continue;
        const tok = tokenFor(n, 'name', prefix);
        // 앞에 한글이 붙어 있지 않고, 뒤에 조사·문장부호가 오는 경우만
        const re = new RegExp(`(?<![가-힣])${escRe(given)}(${JOSA})?(?=[\\s,.!?)'"]|$)`, 'g');
        text = text.replace(re, (m, j) => { counts['이름(부른 이름)'] = (counts['이름(부른 이름)'] || 0) + 1; return tok + fitJosa(tok, j || ''); });
      }
    }
    saveMap(map);
    $('pvOut').value = text;
    const summary = Object.entries(counts).map(([k, v]) => `${k} ${v}곳`).join(' · ');
    $('pvSummary').textContent = $('pvIn').value.trim() ? (summary ? `가린 곳: ${summary}` : '가릴 내용을 찾지 못했어요. 이름 목록을 넣어 주세요.') : '';
    renderSuggest();
    renderMap();
  }

  function renderMap() {
    const tb = $('pvMap');
    tb.innerHTML = '';
    if (!map.items.length) { tb.innerHTML = '<tr><td colspan="3" class="pv-empty">아직 없어요</td></tr>'; return; }
    map.items.forEach((x, i) => {
      const tr = document.createElement('tr');
      const td = (t) => { const c = document.createElement('td'); c.textContent = t; return c; };
      tr.append(td(x.token), td(x.orig));
      const del = document.createElement('td');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'preset-x'; b.textContent = '×'; b.title = '이 줄 지우기';
      b.onclick = () => { map.items.splice(i, 1); saveMap(map); renderMap(); };
      del.append(b); tr.append(del);
      tb.append(tr);
    });
  }

  /* ---------- 되돌리기 ---------- */
  function restore() {
    let text = $('pvAi').value;
    const items = [...map.items].sort((a, b) => b.token.length - a.token.length);
    let n = 0;
    for (const x of items) {
      // "학생A" 와 "학생 A", "[학생A]" 모두 원래대로
      const core = x.token.replace(/^\[|\]$/g, '');
      const loose = escRe(core).replace(/^([가-힣]+)([A-Z]+)$/, '$1\\s?$2');
      const pat = x.kind === 'name' ? `\\[?${loose}\\]?(?![A-Za-z])` : `\\[?${escRe(core)}\\]?(?!\\d)`;
      text = swap(text, pat, x.orig, () => { n++; });
    }
    $('pvRestored').value = text;
    $('pvRestoreInfo').textContent = $('pvAi').value.trim() ? `${n}곳을 원래대로 바꿨어요` : '';
  }

  /* ---------- 버튼 ---------- */
  const copy = async (id, msg) => {
    const v = $(id).value;
    if (!v.trim()) { SSODA.toast('복사할 내용이 없어요'); return; }
    SSODA.toast(await SSODA.copy(v) ? msg : '복사하지 못했어요');
  };
  $('pvIn').addEventListener('input', mask);
  $('pvNames').addEventListener('input', mask);
  $('pvPrefix').addEventListener('input', mask);
  ['pvGiven', ...PATTERNS.map(p => 'pv_' + p.key)].forEach(id => $(id).addEventListener('change', mask));
  $('pvAi').addEventListener('input', restore);
  $('btnPvCopy').addEventListener('click', () => copy('pvOut', '🔒 가린 글을 복사했어요'));
  $('btnPvToPrompt').addEventListener('click', () => {
    const v = $('pvOut').value;
    if (!v.trim()) { SSODA.toast('먼저 원문을 넣어 주세요'); return; }
    SSODA_PROMPT.attachSource('개인정보 가린 글', v);
    SSODA.goTab('prompt');
    SSODA.toast('📎 가린 글을 참고 자료로 넣었어요');
  });
  $('btnPvRestoreCopy').addEventListener('click', () => copy('pvRestored', '🔓 되돌린 글을 복사했어요'));
  $('btnPvToHwp').addEventListener('click', () => {
    const v = $('pvRestored').value;
    if (!v.trim()) { SSODA.toast('먼저 AI 답을 붙여 넣어 주세요'); return; }
    SSODA_HWP.load(v);
    SSODA.goTab('tohwp');
  });
  $('btnPvReset').addEventListener('click', () => {
    if (!window.confirm('대응표를 지울까요? 지우면 앞서 가린 글은 되돌릴 수 없어요.')) return;
    map = { items: [] }; saveMap(map);
    mask(); restore();
  });

  PATTERNS.forEach(p => { const el = $('pv_' + p.key); if (el) el.title = p.label; });
  renderMap();
  window.SSODA_PRIVACY = { mask, restore };
})();
