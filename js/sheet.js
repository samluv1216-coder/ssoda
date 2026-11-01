/* ==================================================================
   엑셀·CSV ↔ 마크다운 표
   - 엑셀(xlsx·xls)·CSV → 시트별 마크다운 표 (AI에게 데이터 주기)
   - AI 답 속 마크다운 표 → 엑셀(.xlsx) (표마다 시트 하나)
   - SheetJS 는 처음 쓸 때만 불러온다 (약 0.9MB)
   ================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SSODA_SHEET = factory(null, root.marked);
})(typeof self !== 'undefined' ? self : this, function (XLSXlib, marked) {
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let libP = null;
  function lib() {
    if (XLSXlib) return Promise.resolve(XLSXlib);
    if (typeof XLSX !== 'undefined') return Promise.resolve(XLSX);
    if (!libP) {
      libP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = LIB;
        s.onload = () => resolve(XLSX);
        s.onerror = () => { libP = null; reject(new Error('sheet-lib')); };
        document.head.appendChild(s);
      });
    }
    return libP;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const cellEsc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim();

  // CSV 는 한글 엑셀·나이스에서 받은 파일이 EUC-KR 인 경우가 많다
  function decodeText(buf) {
    const bytes = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('euc-kr').decode(bytes); }
  }

  /* ---------- 엑셀·CSV → 마크다운 ---------- */
  async function toMarkdown(buf, ext) {
    const X = await lib();
    const wb = /^(csv|tsv|txt)$/.test(ext)
      ? X.read(decodeText(buf), { type: 'string', raw: false, FS: ext === 'tsv' ? '\t' : undefined })
      : X.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const blocks = [];
    const warnings = [];
    let sheets = 0, bigRows = 0;
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      // 칸마다 보이는 그대로(서식 적용된 값), 날짜는 2026-11-20 형식으로
      let rows = [];
      if (ws['!ref']) {
        const rg = X.utils.decode_range(ws['!ref']);
        for (let r = rg.s.r; r <= rg.e.r; r++) {
          const row = [];
          for (let c = rg.s.c; c <= rg.e.c; c++) {
            const cl = ws[X.utils.encode_cell({ r, c })];
            let v = '';
            if (cl) {
              if (cl.t === 'd' && cl.v instanceof Date) v = ymd(cl.v);
              else v = cl.w != null ? cl.w : (cl.v != null ? String(cl.v) : '');
            }
            row.push(String(v).trim());
          }
          rows.push(row);
        }
      }
      // 완전히 빈 열은 빼기
      const width = Math.max(0, ...rows.map(r => r.length));
      const keep = [];
      for (let c = 0; c < width; c++) if (rows.some(r => r[c])) keep.push(c);
      rows = rows.map(r => keep.map(c => r[c] || '')).filter(r => r.some(Boolean));
      if (!rows.length) continue;
      sheets++;
      bigRows = Math.max(bigRows, rows.length);
      // 첫 줄이 칸 하나짜리 제목이면 표 위 제목으로 빼고, 다음 줄을 머리글로
      let title = '';
      if (rows.length > 2 && keep.length > 1 && rows[0].filter(Boolean).length === 1) title = rows.shift().find(Boolean);
      const head = rows[0].map((h, i) => h || `열${i + 1}`);
      const line = (r) => '| ' + r.map(cellEsc).join(' | ') + ' |';
      const table = [line(head), '|' + ' --- |'.repeat(head.length), ...rows.slice(1).map(line)].join('\n');
      if (wb.SheetNames.length > 1 || !/^sheet\d*$/i.test(name)) blocks.push(`## ${name}`);
      if (title) blocks.push(`**${title}**`);
      blocks.push(table);
    }
    if ((wb.Sheets[wb.SheetNames[0]] || {})['!merges']?.length) {
      warnings.push({ level: 'warn', msg: '합쳐진 칸은 첫 칸에만 값이 들어가고 나머지는 빈칸이 돼요.' });
    }
    if (bigRows > 300) {
      warnings.push({ level: 'warn', msg: `행이 ${bigRows.toLocaleString()}개로 많아요. AI에 넣을 때는 필요한 부분만 남기거나 프롬프트 탭의 「나눠서 보내기」를 쓰세요.` });
    }
    if (!sheets) warnings.push({ level: 'error', msg: '표에 내용이 없어요.' });
    return { markdown: blocks.join('\n\n') + '\n', pages: sheets, unit: '시트', removedLines: 0, warnings };
  }

  /* ---------- 마크다운 표 → 엑셀 ---------- */
  const plain = (t) => String(t || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|[^\w])[*_]([^*_]+)[*_](?=[^\w]|$)/g, '$1$2')
    .replace(/\\([|*_`~])/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();

  // "1,234" → 1234, "85%" → 0.85 처럼 숫자는 숫자 칸으로
  function cell(text) {
    const t = plain(text);
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return { t: 'n', v: Number(t.replace(/,/g, '')), z: '#,##0' };
    if (/^-?\d+(\.\d+)?$/.test(t) && !/^0\d/.test(t) && t.length < 16) return { t: 'n', v: Number(t) };
    if (/^-?\d+(\.\d+)?%$/.test(t)) return { t: 'n', v: Number(t.slice(0, -1)) / 100, z: '0%' };
    return { t: 's', v: t };
  }

  function findTables(md) {
    const out = [];
    let heading = '';
    const walk = (tokens) => {
      for (const t of tokens) {
        if (t.type === 'heading') heading = plain(t.text);
        else if (t.type === 'table') { out.push({ heading, rows: [t.header.map(h => h.text), ...t.rows.map(r => r.map(c => c.text))] }); heading = ''; }
        else if (t.items) for (const it of t.items) walk(it.tokens || []);
        else if (t.tokens && t.type === 'blockquote') walk(t.tokens);
      }
    };
    walk(marked.lexer(md || '', { gfm: true }));
    return out;
  }

  const countTables = (md) => findTables(md).length;

  async function tablesToXlsx(md) {
    const X = await lib();
    const tables = findTables(md);
    if (!tables.length) return null;
    const wb = X.utils.book_new();
    const used = new Set();
    tables.forEach((tb, i) => {
      const ws = {};
      const cols = Math.max(...tb.rows.map(r => r.length));
      const widths = Array(cols).fill(4);
      tb.rows.forEach((r, ri) => r.forEach((txt, ci) => {
        const c = ri === 0 ? { t: 's', v: plain(txt) } : cell(txt);
        ws[X.utils.encode_cell({ r: ri, c: ci })] = c;
        // 한글은 영문보다 넓게 잡는다
        const w = [...String(c.v)].reduce((n, ch) => n + (/[ㄱ-힣]/.test(ch) ? 2 : 1), 0);
        widths[ci] = Math.min(60, Math.max(widths[ci], w + 2));
      }));
      ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: tb.rows.length - 1, c: cols - 1 } });
      ws['!cols'] = widths.map(w => ({ wch: w }));
      ws['!autofilter'] = { ref: ws['!ref'] };
      // 시트 이름: 앞 제목 또는 표1… (31자, 금지 문자 제외, 중복 피하기)
      let name = (tb.heading || `표${i + 1}`).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || `표${i + 1}`;
      let n = name, k = 2;
      while (used.has(n)) n = `${name.slice(0, 26)} ${k++}`;
      used.add(n);
      X.utils.book_append_sheet(wb, ws, n);
    });
    const out = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    return { data: out, count: tables.length };
  }

  return { toMarkdown, tablesToXlsx, countTables, findTables };
});
