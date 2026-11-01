/* ==================================================================
   PDF → 마크다운 변환 엔진 (브라우저 전용, pdf.js 사용)
   - 글자 크기로 제목 단계 추정, 목록·문단·간단한 표 복원
   - 반복되는 머리글/바닥글, 쪽번호 제거
   - 스캔 페이지(텍스트 없음)와 글꼴 깨짐 감지
   ================================================================== */
(function () {
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'build/pdf.worker.min.js';

  const BULLET_RE = /^(?:[•●○◦▪■□◆◇►▶‣∙·※✓✔▫❍➢➤▸▹◎]\s*|[-–]\s+)/;
  const ORDERED_RE = /^(\d{1,3})[.)]\s+/;
  const KMARK_RE = /^([가-하][.)]|\(\d{1,3}\)|\([가-하]\)|[①-⑳]|\d{1,3}\))\s*/;
  const PAGE_NUM_RE = /^[-–—\s]*(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?[-–—\s]*$/i;

  const round = (v, step = 0.5) => Math.round(v / step) * step;

  function mode(map) {
    let best = null, bestN = -1;
    for (const [k, n] of map) if (n > bestN) { best = k; bestN = n; }
    return best;
  }

  /* ---------- 1. 페이지별 텍스트 조각 → 줄 ---------- */
  async function readPage(page, pageNo) {
    const viewport = page.getViewport({ scale: 1 });
    // 글꼴 이름(굵게 여부)을 알기 위해 연산자 목록을 먼저 불러온다
    try { await page.getOperatorList(); } catch (e) { /* 무시 */ }
    const content = await page.getTextContent();

    const boldCache = {};
    const isBold = (fontName) => {
      if (fontName in boldCache) return boldCache[fontName];
      let bold = false;
      try {
        if (page.commonObjs.has(fontName)) {
          const f = page.commonObjs.get(fontName);
          bold = !!(f && (f.bold || /bold|black|heavy|semibold|extrabold|-b$|,b$/i.test(f.name || '')));
        }
      } catch (e) { /* 무시 */ }
      return (boldCache[fontName] = bold);
    };

    const items = [];
    const drawn = new Map();
    for (const it of content.items) {
      // 일부 PDF는 띄어쓰기를 NUL 등 제어 문자로 넣어 둔다
      // 공백만 있는 조각도 띄어쓰기 정보라서 남겨 둔다
      const str = (it.str || '').replace(/[\u0000-\u001f]/g, ' ')
        .replace(/\u{F0854}/gu, '『').replace(/\u{F0855}/gu, '』');   // 한글(HWP) 전용 문자
      if (!str) continue;
      const [a, b, c, d, x, y] = it.transform;
      const size = Math.hypot(c, d) || it.height || 10;
      // 세로쓰기·회전 텍스트는 건너뜀
      if (Math.abs(b) > Math.abs(a) * 0.5 && Math.abs(a) < 0.01) continue;
      if (str.trim() && isOverprint(str, x, y, size)) continue;
      items.push({ str, x, y, w: it.width, size, bold: isBold(it.fontName) });
    }

    // 단(칼럼)별로 위→아래 순서로 줄 만들기
    const lines = [];
    splitColumns(items, viewport.width, viewport.height).forEach((colItems, col) => {
      const rows = [];
      colItems.sort((p, q) => (q.y - p.y) || (p.x - q.x));
      for (const it of colItems) {
        const row = rows.find(r => Math.abs(r.y - it.y) < Math.max(r.size, it.size) * 0.5);
        if (row) { row.items.push(it); row.size = Math.max(row.size, it.size); }
        else rows.push({ y: it.y, size: it.size, items: [it] });
      }
      const colLines = rows.filter(r => r.items.some(i => i.str.trim()))
        .map(r => buildLine(r, pageNo, viewport.height));
      colLines.sort((p, q) => q.y - p.y);
      lines.push(...colLines);
    });
    return { lines, height: viewport.height, width: viewport.width, chars: items.reduce((n, i) => n + i.str.trim().length, 0) };

    // 한글(HWP)의 그림자·굵게 효과는 같은 글자를 살짝 비켜 여러 번 찍는다 → 하나만 남김
    function isOverprint(str, x, y, size) {
      const list = drawn.get(str) || [];
      const dup = list.some(p => Math.abs(p.x - x) < size * 0.4 && Math.abs(p.y - y) < size * 0.4);
      if (!dup) { list.push({ x, y }); drawn.set(str, list); }
      return dup;
    }
  }

  /* 페이지 가운데에 위아래로 빈 띠가 있으면 2단 편집(또는 2쪽 모아찍기)으로 보고 나눈다 */
  function splitColumns(items, W, H) {
    const real = items.filter(i => i.str.trim());
    if (real.length < 20) return [items];
    // 맨 위 제목 영역(위쪽 20%)은 두 단에 걸쳐 있을 수 있어 빈 띠 찾기에서 뺀다
    const topY = H * 0.8;
    const BINS = 200, cover = new Array(BINS).fill(0);
    for (const i of real.filter(i => i.y < topY)) {
      const a = Math.max(0, Math.floor(i.x / W * BINS));
      const b = Math.min(BINS - 1, Math.floor((i.x + i.w) / W * BINS));
      for (let k = a; k <= b; k++) cover[k]++;
    }
    const lo = Math.floor(BINS * 0.3), hi = Math.ceil(BINS * 0.7);
    let best = null;
    for (let k = lo; k < hi; k++) {
      if (cover[k] > 1) continue;
      let e = k; while (e < hi && cover[e] <= 1) e++;
      if (!best || e - k > best.e - best.s) best = { s: k, e };
      k = e;
    }
    if (!best || best.e - best.s < 3) return [items];
    const cut = (best.s + best.e) / 2 / BINS * W;
    // 위쪽에서 가운데 띠를 가로지르는 줄(제목 등)은 맨 앞에 따로 둔다
    const spanRows = new Set(real.filter(i => i.y >= topY && i.x < cut && i.x + i.w > cut).map(i => Math.round(i.y)));
    const isHead = (i) => i.y >= topY && [...spanRows].some(y => Math.abs(y - i.y) < i.size * 0.5);
    const head = items.filter(isHead);
    const rest = items.filter(i => !isHead(i));
    const left = rest.filter(i => i.x + i.w / 2 < cut), right = rest.filter(i => i.x + i.w / 2 >= cut);
    const chars = (arr) => arr.reduce((n, i) => n + i.str.trim().length, 0);
    const total = chars(real);
    if (chars(left) < total * 0.15 || chars(right) < total * 0.15) return [items];
    return head.length ? [head, left, right] : [left, right];
  }

  function buildLine(row, pageNo, pageH) {
    const its = row.items.sort((p, q) => p.x - q.x);
    // 크기·굵기는 글자 수 기준 다수결
    const sizeVotes = new Map(); let boldChars = 0, allChars = 0;
    for (const it of its) {
      const n = it.str.trim().length; allChars += n;
      if (it.bold) boldChars += n;
      const s = round(it.size);
      sizeVotes.set(s, (sizeVotes.get(s) || 0) + n);
    }
    const size = mode(sizeVotes);

    // 큰 간격(표 칸 구분)으로 세그먼트 나누기
    const segments = [];
    let cur = null, prevEnd = null;
    for (const it of its) {
      if (!it.str.trim()) {
        if (cur) cur.parts.push({ str: ' ', bold: it.bold });
        continue;
      }
      const gap = prevEnd == null ? 0 : it.x - prevEnd;
      if (!cur || gap > size * 2) {
        cur = { parts: [], x: it.x, xEnd: it.x + it.w };
        segments.push(cur);
      } else if (gap > size * 0.15 && !/\s$/.test(cur.parts.at(-1).str) && !/^\s/.test(it.str)) {
        cur.parts.push({ str: ' ', bold: it.bold });
      }
      cur.parts.push({ str: it.str, bold: it.bold });
      cur.xEnd = Math.max(cur.xEnd, it.x + it.w);
      prevEnd = it.x + it.w;
    }
    for (const s of segments) {
      s.text = s.parts.map(p => p.str).join('')
        .replace(/\s*[·.‥…ㆍ･]{4,}\s*/g, ' … ')   // 목차 점선
        .replace(/\s+/g, ' ').trim();
    }
    const plain = segments.map(s => s.text).join(' ').trim();
    return {
      page: pageNo, y: row.y, x: its.find(i => i.str.trim()).x, xEnd: prevEnd, size,
      bold: allChars > 0 && boldChars / allChars > 0.7,
      segments, text: plain, pageH,
      topRatio: 1 - row.y / pageH,
    };
  }

  /* ---------- 2. 머리글/바닥글/쪽번호 제거 ---------- */
  function stripRunningHeaders(pages) {
    const n = pages.length;
    const key = (l) => l.text.replace(/\d+/g, '#').replace(/\s+/g, '');
    const inMargin = (l) => l.topRatio < 0.09 || l.topRatio > 0.91;
    const counts = new Map();
    if (n >= 3) {
      for (const p of pages) {
        const seen = new Set();
        for (const l of p.lines) if (inMargin(l)) seen.add(key(l));
        for (const k of seen) counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    let removed = 0;
    for (const p of pages) {
      p.lines = p.lines.filter(l => {
        if (!inMargin(l)) return true;
        const drop = PAGE_NUM_RE.test(l.text) || (n >= 3 && counts.get(key(l)) >= Math.max(2, n * 0.5));
        if (drop) removed++;
        return !drop;
      });
    }
    return removed;
  }

  /* ---------- 3. 글자 크기 → 제목 단계 ---------- */
  function sizeLevels(allLines) {
    const votes = new Map();
    for (const l of allLines) votes.set(l.size, (votes.get(l.size) || 0) + l.text.length);
    const body = mode(votes) || 10;
    const bigger = [...votes.keys()]
      .filter(s => s > body * 1.15)
      // 한두 글자짜리 장식용 큰 글씨는 제외
      .filter(s => votes.get(s) >= 2)
      .sort((p, q) => q - p);
    const level = new Map();
    bigger.slice(0, 4).forEach((s, i) => level.set(s, i + 1));
    bigger.slice(4).forEach(s => level.set(s, 4));
    return { body, level };
  }

  /* ---------- 4. 표 블록 찾기 ---------- */
  function findTables(lines) {
    const tables = new Map(); // 시작 인덱스 → {end, rows}
    let i = 0;
    while (i < lines.length) {
      let j = i;
      while (j < lines.length && lines[j].segments.length >= 2 && lines[j].page === lines[i].page &&
             (j === i || (lines[j - 1].y > lines[j].y && lines[j - 1].y - lines[j].y < lines[j].size * 3))) j++;
      if (j - i >= 2) {
        const block = lines.slice(i, j);
        const table = buildTable(block);
        if (table) { tables.set(i, { end: j, md: table }); i = j; continue; }
      }
      i = Math.max(j, i + 1);
    }
    return tables;
  }

  function buildTable(block) {
    const tol = block[0].size * 1.5;
    const starts = [];
    for (const l of block) for (const s of l.segments) {
      const c = starts.find(v => Math.abs(v.x - s.x) < tol);
      if (c) { c.n++; c.x = (c.x * (c.n - 1) + s.x) / c.n; } else starts.push({ x: s.x, n: 1 });
    }
    const cols = starts.filter(c => c.n >= 2).map(c => c.x).sort((p, q) => p - q);
    if (cols.length < 2) return null;
    // 두 단 편집(2단 레이아웃)은 표가 아님: 칸이 2개이고 각 칸 텍스트가 길면 제외
    const avgLen = block.reduce((n, l) => n + l.text.length, 0) / block.length;
    if (cols.length === 2 && avgLen > 50) return null;

    const rows = block.map(l => {
      const cells = cols.map(() => []);
      for (const s of l.segments) {
        let ci = 0;
        for (let k = 0; k < cols.length; k++) if (s.x >= cols[k] - tol) ci = k;
        cells[ci].push(s.text);
      }
      return cells.map(c => c.join(' ').replace(/\|/g, '\\|'));
    });
    const out = [];
    out.push('| ' + rows[0].join(' | ') + ' |');
    out.push('|' + cols.map(() => ' --- ').join('|') + '|');
    for (const r of rows.slice(1)) out.push('| ' + r.join(' | ') + ' |');
    return out.join('\n');
  }

  /* ---------- 5. 줄 → 마크다운 블록 ---------- */
  const escapeMd = (t) => t.replace(/([*`])/g, '\\$1').replace(/^([#>])/, '\\$1');

  function inlineText(line, allowBold) {
    if (!allowBold || line.bold) return escapeMd(line.text);
    // 줄 안의 일부만 굵은 경우 **…** 로 감싸기
    let out = '';
    for (const seg of line.segments) {
      if (out) out += ' ';
      let run = '', runBold = null;
      const flush = () => {
        if (!run) return;
        const t = escapeMd(run);
        if (runBold && t.trim()) {
          const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
          out += lead + '**' + t.trim() + '**' + trail;
        } else out += t;
        run = '';
      };
      for (const p of seg.parts) {
        if (runBold !== null && p.bold !== runBold && p.str.trim()) flush();
        if (p.str.trim()) runBold = p.bold;
        run += p.str;
      }
      flush();
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // 한글 줄바꿈 자리는 일단 표시만 해 두고, 문서 전체를 본 뒤 띄울지 정한다
  const HJOIN = '\u0001';
  const HANGUL_END = /[\uAC00-\uD7A3]$/, HANGUL_START = /^[\uAC00-\uD7A3]/;

  function joinText(a, b) {
    if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
    if (HANGUL_END.test(a) && HANGUL_START.test(b)) return a + HJOIN + b;
    return a + ' ' + b;
  }

  // 한글(HWP)은 단어 가운데서 줄을 바꾸기도 한다. 줄 끝 조각 + 다음 줄 첫 글자가
  // 문서의 다른 곳에 한 단어로 나오면 붙이고(활|용 → 활용), 아니면 띄운다.
  function resolveHangulJoins(md) {
    if (!md.includes(HJOIN)) return md;
    const prefixes = new Set();
    for (const tok of md.replace(new RegExp(HJOIN, 'g'), ' ').match(/[\uAC00-\uD7A3]{2,}/g) || []) {
      for (let k = 2; k <= Math.min(tok.length, 7); k++) prefixes.add(tok.slice(0, k));
    }
    return md.replace(new RegExp('([\uAC00-\uD7A3]{1,6})' + HJOIN + '([\uAC00-\uD7A3])', 'g'),
      (m, tail, head) => tail + (prefixes.has(tail + head) ? '' : ' ') + head);
  }

  function toMarkdown(pages, opts) {
    const all = pages.flatMap(p => p.lines);
    const { body, level } = sizeLevels(all);

    // 본문 줄 간격(가장 흔한 값) 추정
    const gapVotes = new Map();
    for (const p of pages) for (let i = 1; i < p.lines.length; i++) {
      const a = p.lines[i - 1], b = p.lines[i];
      if (a.size === body && b.size === body) {
        const g = round(a.y - b.y, 1);
        if (g > 0) gapVotes.set(g, (gapVotes.get(g) || 0) + 1);
      }
    }
    const lineGap = mode(gapVotes) || body * 1.5;
    const minX = Math.min(...all.filter(l => l.size === body).map(l => l.x).concat([Infinity]));

    const tables = opts.tables ? findTables(all) : new Map();
    const blocks = [];
    let para = null;       // {type:'p'|'li', text, x, last}
    const listStack = [];  // 목록 들여쓰기 x 위치
    let lastPage = 0;

    const closePara = () => { if (para) { blocks.push(para.out()); para = null; } };

    for (let i = 0; i < all.length; i++) {
      const l = all[i];

      if (opts.pageMarks && l.page !== lastPage) {
        closePara();
        blocks.push(`<!-- ${l.page}쪽 -->`);
      }
      const prev = i > 0 ? all[i - 1] : null;
      const samePage = prev && prev.page === l.page;
      // 새 쪽이나 새 단으로 넘어가면 목록 들여쓰기 기준을 초기화
      if (prev && (!samePage || l.y > prev.y)) listStack.length = 0;
      lastPage = l.page;

      if (tables.has(i)) {
        closePara(); listStack.length = 0;
        const t = tables.get(i);
        blocks.push(t.md);
        i = t.end - 1;
        continue;
      }

      const hLevel = level.get(l.size);
      if (hLevel && l.text.length <= 120) {
        // 같은 크기 제목이 두 줄로 나뉜 경우 이어 붙이기
        const lastBlock = blocks.at(-1);
        const hashes = '#'.repeat(hLevel);
        if (!para && samePage && prev.size === l.size && lastBlock && lastBlock.startsWith(hashes + ' ') &&
            prev.y > l.y && prev.y - l.y < l.size * 1.8) {
          blocks[blocks.length - 1] = lastBlock + ' ' + escapeMd(l.text);
        } else {
          closePara(); listStack.length = 0;
          blocks.push(hashes + ' ' + escapeMd(l.text));
        }
        continue;
      }

      const raw = l.text;
      let m, marker = null, rest = raw;
      if ((m = raw.match(BULLET_RE)) && raw.length > m[0].length) { marker = '-'; rest = raw.slice(m[0].length); }
      else if ((m = raw.match(ORDERED_RE))) { marker = m[1] + '.'; rest = raw.slice(m[0].length); }
      else if ((m = raw.match(KMARK_RE)) && raw.length > m[0].length) { marker = '- ' + m[1]; rest = raw.slice(m[0].length); }

      const gap = samePage ? prev.y - l.y : Infinity;
      const bigGap = gap > lineGap * 1.45 || gap < 0;

      if (marker) {
        closePara();
        while (listStack.length && l.x < listStack.at(-1) - body * 0.5) listStack.pop();
        if (!listStack.length || l.x > listStack.at(-1) + body * 0.8) listStack.push(l.x);
        const depth = listStack.length - 1;
        const indent = '  '.repeat(depth) + (depth && /^\d/.test(marker) ? ' ' : '');
        const text = escapeMd(rest.trim());
        para = { type: 'li', text, x: l.x, out() { return indent + marker + ' ' + this.text; } };
        continue;
      }

      // 목록 항목이 다음 줄로 이어지는 경우 (들여쓰기 유지 또는 간격 좁음)
      if (para && para.type === 'li' && !bigGap && l.x > para.x - body * 0.3 && l.size === prev.size) {
        para.text = joinText(para.text, inlineText(l, opts.bold));
        continue;
      }
      if (para && para.type === 'li') { closePara(); if (bigGap || l.x <= minX + body * 0.5) listStack.length = 0; }

      const firstIndent = l.x > minX + body * 0.8 && prev && /[.?!다요]$|[.?!]["”』」)]$/.test(prev.text);
      const startNew = !para || bigGap || l.size !== prev.size || firstIndent ||
                       (prev && prev.bold !== l.bold && (prev.bold || l.bold) && l.text.length < 60);
      const text = l.bold && opts.bold ? `**${escapeMd(l.text)}**` : inlineText(l, opts.bold);
      if (startNew) {
        closePara();
        para = { type: 'p', text, x: l.x, out() { return this.text; } };
      } else {
        // 두 줄 이상 굵은 문장: **a** **b** → **a b**
        if (para.text.endsWith('**') && text.startsWith('**')) para.text = para.text.slice(0, -2) + ' ' + text.slice(2);
        else para.text = joinText(para.text, text);
      }
    }
    closePara();

    // 목록끼리는 붙이고, 나머지 블록 사이에는 빈 줄
    let md = '';
    blocks.forEach((b, k) => {
      if (k > 0) {
        const isLi = (s) => /^\s*(-|\d+\.)\s/.test(s);
        md += isLi(b) && isLi(blocks[k - 1]) ? '\n' : '\n\n';
      }
      md += b;
    });
    return resolveHangulJoins(md).trim() + '\n';
  }

  /* ---------- 6. 깨진 글자 감지 ---------- */
  function garbleScore(text) {
    const t = text.replace(/\s/g, '');
    if (!t) return 0;
    let bad = 0, han = 0;
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if ((c >= 0xE000 && c <= 0xF8FF) || c === 0xFFFD || c < 0x20) bad++;
      else if (c >= 0x4E00 && c <= 0x9FFF) han++;
    }
    return { bad: bad / t.length, han: han / t.length };
  }

  /* ---------- 공개 API ---------- */
  async function convert(arrayBuffer, opts = {}, onProgress = () => {}) {
    opts = { stripHeaders: true, tables: true, bold: true, pageMarks: false, ...opts };
    const doc = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: PDFJS + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS + 'standard_fonts/',
    }).promise;

    const pages = [];
    const emptyPages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const p = await readPage(page, n);
      if (p.chars < 5) emptyPages.push(n);
      pages.push(p);
      page.cleanup();
      onProgress(n, doc.numPages);
    }

    const removed = opts.stripHeaders ? stripRunningHeaders(pages) : 0;
    let md = toMarkdown(pages, opts);

    // 텍스트가 없는 페이지 표시
    if (emptyPages.length) {
      md += `\n<!-- 텍스트가 없는 페이지: ${emptyPages.join(', ')}쪽 (스캔 이미지일 수 있음) -->\n`;
    }

    const warnings = [];
    if (emptyPages.length === doc.numPages) {
      warnings.push({ level: 'error', msg: '글자를 찾지 못했어요. 스캔한 이미지 PDF로 보여요. 문자 인식(OCR)이나 AI 변환이 필요해요.' });
    } else if (emptyPages.length) {
      warnings.push({ level: 'warn', msg: `${emptyPages.join(', ')}쪽은 글자가 없어요 (스캔 이미지일 수 있음).` });
    }
    const g = garbleScore(md);
    if (g.bad > 0.03) {
      warnings.push({ level: 'error', msg: '글자가 깨져 보여요. 글꼴 정보가 없는 PDF(한글·HWP에서 만든 PDF에서 자주 생김)라 AI 변환이 필요할 수 있어요.' });
    } else if (g.han > 0.3) {
      warnings.push({ level: 'warn', msg: '한자 비율이 매우 높아요. 원문이 한자 위주가 아니라면 글자가 깨진 것일 수 있어요.' });
    }

    const meta = await doc.getMetadata().catch(() => null);
    const title = meta && meta.info && meta.info.Title ? String(meta.info.Title).trim() : '';
    await doc.destroy();
    return { markdown: md, pages: pages.length, removedLines: removed, warnings, title };
  }

  window.PDF2MD = { convert };
})();
