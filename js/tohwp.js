/* ==================================================================
   AI 답 → 한글 탭
   마크다운을 붙여 넣으면 미리보기 + .hwpx 저장 + 한글용 서식 복사
   ================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = 'ssoda.tohwp.draft';

  const SAMPLE = `# 2학기 현장체험학습 안내

학부모님, 안녕하십니까? 가정에 **건강과 행복**이 가득하시기를 바랍니다.

## 1. 일정 및 장소

- 일시: 2026. 11. 20.(금) 09:00 ~ 15:00
- 장소: 국립중앙과학관
- 준비물: 도시락, 물, 필기도구

## 2. 세부 일정

| 시간 | 활동 | 비고 |
|:---:|---|---|
| 09:00 | 출발 | 버스 3대 |
| 10:30 | 전시관 관람 | 모둠별 활동 |
| 12:00 | 점심 식사 | 도시락 |

> 회신서는 11. 14.(금)까지 담임 선생님께 제출해 주세요.
`;

  const escHtml = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 미리보기에서 마크다운 속 HTML이 실행되지 않도록 글자로 보여 준다
  const safeMarked = new marked.Marked({ gfm: true, renderer: { html: (t) => escHtml(typeof t === 'string' ? t : t.text) } });

  const opts = () => ({
    bodyFont: $('hwpFont').value,
    baseSize: Number($('hwpSize').value),
    centerTitle: $('hwpCenter').checked,
  });

  /* ---------- 미리보기 ---------- */
  function render() {
    const md = $('hwpIn').value;
    const html = md.trim() ? safeMarked.parse(md) : '<div class="empty">왼쪽에 AI 답을 붙여 넣으면 여기에 한글 문서 모양으로 보여요.</div>';
    const pv = $('hwpPreview');
    pv.innerHTML = html;
    pv.style.fontFamily = $('hwpFont').value === 'dotum' ? "'함초롬돋움', 'HCR Dotum', 'Noto Sans KR', sans-serif" : "'함초롬바탕', 'HCR Batang', 'Noto Serif KR', serif";
    pv.style.fontSize = (Number($('hwpSize').value) / 100) + 'pt';
    pv.classList.toggle('center-title', $('hwpCenter').checked);
    $('hwpLen').textContent = md.trim() ? `${md.length.toLocaleString()}자` : '';
    try { localStorage.setItem(DRAFT_KEY, md); } catch (e) { /* 무시 */ }
  }

  /* ---------- 파일 이름 ---------- */
  function fileName() {
    let n = $('hwpName').value.trim();
    if (!n) {
      const m = $('hwpIn').value.match(/^\s*#{1,3}\s+(.+)$/m);
      n = m ? m[1] : '쏘다_문서';
    }
    n = n.replace(/[*_`#]/g, '').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60) || '쏘다_문서';
    return n.endsWith('.hwpx') ? n : n + '.hwpx';
  }

  /* ---------- .hwpx 저장 ---------- */
  async function saveHwpx() {
    const md = $('hwpIn').value;
    if (!md.trim()) { SSODA.toast('먼저 AI 답(마크다운)을 붙여 넣어 주세요'); return; }
    try {
      const blob = await MD2HWPX.toHwpx(md, opts());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      SSODA.toast('📝 한글 파일을 저장했어요');
    } catch (e) {
      console.error(e);
      SSODA.toast('한글 파일을 만들지 못했어요');
    }
  }

  /* ---------- 한글용 복사 (서식 유지) ---------- */
  // 한글은 붙여 넣을 때 HTML의 인라인 스타일을 읽으므로 표 테두리 등을 직접 지정
  function richHtml(md) {
    const font = $('hwpFont').value === 'dotum' ? '함초롬돋움' : '함초롬바탕';
    const pt = Number($('hwpSize').value) / 100;
    const div = document.createElement('div');
    div.innerHTML = safeMarked.parse(md);
    const style = (sel, css) => div.querySelectorAll(sel).forEach(el => el.setAttribute('style', css));
    style('h1', `font-family:함초롬돋움;font-size:${pt * 1.6}pt;font-weight:bold;` + ($('hwpCenter').checked ? 'text-align:center;' : ''));
    style('h2', `font-family:함초롬돋움;font-size:${pt * 1.35}pt;font-weight:bold;`);
    style('h3', `font-family:함초롬돋움;font-size:${pt * 1.15}pt;font-weight:bold;`);
    style('h4,h5,h6', `font-family:함초롬돋움;font-size:${pt}pt;font-weight:bold;`);
    style('p,li', `font-family:${font};font-size:${pt}pt;line-height:160%;`);
    style('table', 'border-collapse:collapse;width:100%;');
    style('th', `border:1px solid #000;padding:3px 6px;background:#E7EDF5;font-family:${font};font-size:${pt * 0.92}pt;font-weight:bold;text-align:center;`);
    style('td', `border:1px solid #000;padding:3px 6px;font-family:${font};font-size:${pt * 0.92}pt;`);
    style('blockquote', 'border-left:3px solid #94A3B8;padding-left:10px;color:#475569;');
    style('code', 'font-family:함초롬돋움;background:#EEF2F7;');
    return `<html><head><meta charset="utf-8"></head><body style="font-family:${font};font-size:${pt}pt;">${div.innerHTML}</body></html>`;
  }

  async function copyRich() {
    const md = $('hwpIn').value;
    if (!md.trim()) { SSODA.toast('먼저 AI 답(마크다운)을 붙여 넣어 주세요'); return; }
    const html = richHtml(md);
    const text = MD2HWPX.build(md, opts()).plain;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      SSODA.toast('📋 복사했어요. 한글 문서에 붙여 넣으세요 (Ctrl/⌘+V)');
    } catch (e) {
      // ClipboardItem 을 지원하지 않는 브라우저: 미리보기 영역을 선택해서 복사
      const sel = window.getSelection(), range = document.createRange();
      const box = document.createElement('div');
      box.innerHTML = html; box.style.position = 'fixed'; box.style.left = '-9999px';
      document.body.appendChild(box);
      range.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges(); box.remove();
      SSODA.toast(ok ? '📋 복사했어요. 한글 문서에 붙여 넣으세요' : '복사하지 못했어요');
    }
  }

  /* ---------- 시작 ---------- */
  let draft = '';
  try { draft = localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { /* 무시 */ }
  $('hwpIn').value = draft;
  ['hwpIn'].forEach(id => $(id).addEventListener('input', render));
  ['hwpFont', 'hwpSize', 'hwpCenter'].forEach(id => $(id).addEventListener('change', render));
  $('btnHwpSave').addEventListener('click', saveHwpx);
  $('btnHwpCopy').addEventListener('click', copyRich);
  $('btnHwpSample').addEventListener('click', () => { $('hwpIn').value = SAMPLE; render(); });
  $('btnHwpClear').addEventListener('click', () => { $('hwpIn').value = ''; $('hwpName').value = ''; render(); });
  $('btnHwpPaste').addEventListener('click', async () => {
    try { $('hwpIn').value = await navigator.clipboard.readText(); render(); }
    catch (e) { SSODA.toast('붙여넣기 권한이 없어요. 입력 칸에 직접 붙여 넣어 주세요 (Ctrl/⌘+V)'); $('hwpIn').focus(); }
  });
  render();

  // 다른 탭에서 마크다운 넘겨받기 (PDF 변환 결과 등)
  window.SSODA_HWP = { load(md, name) { $('hwpIn').value = md; if (name) $('hwpName').value = name.replace(/\.pdf$/i, ''); render(); } };
})();
