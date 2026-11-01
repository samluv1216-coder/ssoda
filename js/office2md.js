/* ==================================================================
   한글(HWPX) · 워드(DOCX) · 파워포인트(PPTX) → 마크다운
   - 세 형식 모두 zip 안의 XML 이라 JSZip + DOMParser 로 읽는다
   - 한글: 글자 크기로 제목, 문단 모양의 자동 번호·글머리표를 목록으로
   - 워드: 스타일(제목 1…)과 번호 매기기, 표
   - 파워포인트: 슬라이드 순서대로 제목·본문·표·발표자 노트
   ================================================================== */
(function () {
  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const desc = (el, name) => el ? [...el.getElementsByTagNameNS('*', name)] : [];
  const attr = (el, name) => {
    if (!el) return null;
    for (const a of el.attributes) if (a.localName === name) return a.value;
    return null;
  };
  const cellEsc = (t) => t.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const mdEsc = (t) => t.replace(/^([#>])/, '\\$1');

  function wrapBold(text, bold) {
    if (!bold || !text.trim()) return text;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return `${lead}**${text.trim()}**${trail}`;
  }

  function tableMd(grid) {
    if (!grid.length) return '';
    const cols = Math.max(...grid.map(r => r.length));
    const row = (r) => '| ' + Array.from({ length: cols }, (_, i) => cellEsc(r[i] || '')).join(' | ') + ' |';
    return [row(grid[0]), '|' + ' --- |'.repeat(cols), ...grid.slice(1).map(row)].join('\n');
  }

  // 문단 묶음 → 마크다운 (목록끼리는 붙이고 나머지는 빈 줄)
  function joinBlocks(blocks) {
    let md = '';
    const isLi = (s) => /^\s*(-|\d+\.)\s/.test(s);
    blocks.filter(b => b != null && b !== '').forEach((b, i, arr) => {
      if (i > 0) md += isLi(b) && isLi(arr[i - 1]) ? '\n' : '\n\n';
      md += b;
    });
    return md.trim() + '\n';
  }

  /* ================= 한글 HWPX ================= */
  async function hwpx(zip) {
    const header = parseXml(await zip.file('Contents/header.xml').async('string'));
    const chars = {}, paras = {}, styles = {};
    for (const c of desc(header, 'charPr')) {
      chars[attr(c, 'id')] = { size: Number(attr(c, 'height')) || 1000, bold: !!kid(c, 'bold'), italic: !!kid(c, 'italic') };
    }
    for (const p of desc(header, 'paraPr')) {
      const h = kid(p, 'heading');
      paras[attr(p, 'id')] = { type: attr(h, 'type') || 'NONE', level: Number(attr(h, 'level')) || 0 };
    }
    for (const s of desc(header, 'style')) styles[attr(s, 'id')] = attr(s, 'name') || '';

    // 본문 구역 순서 (content.hpf 의 spine)
    let sections = [];
    const hpf = zip.file('Contents/content.hpf');
    if (hpf) {
      const doc = parseXml(await hpf.async('string'));
      const items = {};
      for (const it of desc(doc, 'item')) items[attr(it, 'id')] = attr(it, 'href');
      sections = desc(doc, 'itemref').map(r => items[attr(r, 'idref')]).filter(h => h && /section\d+\.xml$/.test(h));
    }
    if (!sections.length) sections = Object.keys(zip.files).filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    // 문단 하나 읽기: [{text, bold}] 조각 + 대표 글자 크기
    function readPara(p) {
      const segs = [];
      const sizeVotes = {};
      for (const run of kids(p, 'run')) {
        const cp = chars[attr(run, 'charPrIDRef')] || { size: 1000 };
        for (const t of kids(run, 't')) {
          let txt = '';
          for (const n of t.childNodes) {
            if (n.nodeType === 3) txt += n.nodeValue;
            else if (n.localName === 'lineBreak') txt += '\n';
            else if (n.localName === 'tab') txt += ' ';
          }
          if (!txt) continue;
          segs.push({ text: txt, bold: cp.bold });
          const k = txt.replace(/\s/g, '').length;
          sizeVotes[cp.size] = (sizeVotes[cp.size] || 0) + k;
        }
      }
      const size = Number(Object.entries(sizeVotes).sort((a, b) => b[1] - a[1])[0]?.[0]) || 1000;
      const plain = segs.map(s => s.text).join('');
      const boldChars = segs.filter(s => s.bold).reduce((n, s) => n + s.text.trim().length, 0);
      return { segs, size, plain, allBold: plain.trim().length > 0 && boldChars >= plain.replace(/\s/g, '').length * 0.8 };
    }

    // 표 읽기 → 2차원 배열 (셀 합치기는 빈칸으로)
    function readTable(tbl) {
      const rows = Number(attr(tbl, 'rowCnt')) || kids(tbl, 'tr').length;
      const cols = Number(attr(tbl, 'colCnt')) || 1;
      const grid = Array.from({ length: rows }, () => Array(cols).fill(''));
      kids(tbl, 'tr').forEach((tr, ri) => {
        kids(tr, 'tc').forEach((tc, ci) => {
          const addr = kid(tc, 'cellAddr');
          const r = addr ? Number(attr(addr, 'rowAddr')) : ri;
          const c = addr ? Number(attr(addr, 'colAddr')) : ci;
          const text = desc(tc, 'p').map(pp => readPara(pp).plain.trim()).filter(Boolean).join(' ');
          if (grid[r] && c < cols) grid[r][c] = text;
        });
      });
      return grid;
    }

    const items = [];   // {kind:'p'|'table'|'box', ...}
    for (const name of sections) {
      const f = zip.file(name);
      if (!f) continue;
      const sec = parseXml(await f.async('string')).documentElement;
      for (const p of kids(sec, 'p')) {
        // 문단 안의 표는 따로 꺼낸다
        for (const run of kids(p, 'run')) {
          for (const tbl of kids(run, 'tbl')) {
            const rows = Number(attr(tbl, 'rowCnt')), cols = Number(attr(tbl, 'colCnt'));
            if (rows === 1 && cols === 1) {
              // 1칸짜리 표는 글상자처럼 쓰인 것 → 안의 문단을 그대로
              for (const pp of desc(tbl, 'p')) items.push({ kind: 'p', para: readPara(pp), pp: paras[attr(pp, 'paraPrIDRef')], style: styles[attr(pp, 'styleIDRef')] });
            } else items.push({ kind: 'table', grid: readTable(tbl) });
          }
        }
        const rp = readPara(p);
        if (rp.plain.trim()) items.push({ kind: 'p', para: rp, pp: paras[attr(p, 'paraPrIDRef')], style: styles[attr(p, 'styleIDRef')] });
      }
    }

    // 본문 크기 → 제목 단계
    const votes = {};
    for (const it of items) if (it.kind === 'p') votes[it.para.size] = (votes[it.para.size] || 0) + it.para.plain.length;
    const body = Number(Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]) || 1000;
    const bigger = Object.keys(votes).map(Number).filter(s => s >= body * 1.15).sort((a, b) => b - a);
    const level = (s) => { const i = bigger.indexOf(s); return i < 0 ? 0 : Math.min(i + 1, 4); };

    const SYMBOL_LEVEL = { '□': 0, '■': 0, '◆': 0, '◇': 0, '❍': 1, '○': 1, '●': 1, '◦': 1, '-': 2, '―': 2, '–': 2, '·': 3, '∙': 3, '•': 3 };
    const counters = [];
    const blocks = [];
    let pics = 0;
    for (const name of sections) { const f = zip.file(name); if (f) pics += ((await f.async('string')).match(/<hp:pic\b/g) || []).length; }

    for (const it of items) {
      if (it.kind === 'table') { blocks.push(tableMd(it.grid)); counters.length = 0; continue; }
      const { para, pp, style } = it;
      const text = para.plain.replace(/\s+\n/g, '\n').trim();
      const inline = para.segs.map(s => wrapBold(s.text, s.bold && !para.allBold)).join('').replace(/\*\*\s*\*\*/g, '').trim();
      const hl = level(para.size);
      const styleLv = /^개요\s?(\d)/.exec(style || '');
      if ((hl && text.length <= 80) || (styleLv && text.length <= 80 && !pp?.type?.match(/NUMBER|OUTLINE|BULLET/))) {
        const lv = hl || Math.min(Number(styleLv[1]) + 1, 4);
        blocks.push('#'.repeat(lv) + ' ' + mdEsc(text.replace(/\n/g, ' ')));
        counters.length = 0;
        continue;
      }
      // 문단 모양의 자동 번호·글머리표
      if (pp && pp.type !== 'NONE') {
        const lv = Math.max(0, Math.min(pp.level, 5));
        const indent = '   '.repeat(lv);
        if (pp.type === 'BULLET') { blocks.push(`${indent}- ${inline}`); continue; }
        counters.length = lv + 1;
        counters[lv] = (counters[lv] || 0) + 1;
        blocks.push(`${indent}${counters[lv]}. ${inline}`);
        continue;
      }
      // 공문 기호 □ ○ ― · → 들여쓴 목록
      const sym = text.match(/^\s*([□■◆◇❍○●◦―–·∙•]|-(?=\s))\s*/);
      if (sym && text.length > sym[0].length) {
        const lv = SYMBOL_LEVEL[sym[1]] ?? 0;
        blocks.push(`${'   '.repeat(lv)}- ${inline.replace(/^\s*([□■◆◇❍○●◦―–·∙•]|-(?=\s))\s*/, '')}`);
        continue;
      }
      counters.length = 0;
      blocks.push(para.allBold && text.length < 60 ? `**${mdEsc(text)}**` : mdEsc(inline).replace(/\n/g, '  \n'));
    }
    const warnings = [];
    if (pics) warnings.push({ level: 'warn', msg: `그림 ${pics}개는 마크다운에 넣지 못했어요.` });
    return { markdown: joinBlocks(blocks), pages: null, unit: '', warnings };
  }

  /* ================= 워드 DOCX ================= */
  async function docx(zip) {
    const doc = parseXml(await zip.file('word/document.xml').async('string'));
    const styleName = {};
    const stylesF = zip.file('word/styles.xml');
    if (stylesF) {
      const st = parseXml(await stylesF.async('string'));
      for (const s of desc(st, 'style')) styleName[attr(s, 'styleId')] = (attr(kid(s, 'name'), 'val') || '').toLowerCase();
    }
    // 번호 형식: numId → ilvl → bullet 여부
    const numFmt = {};
    const numF = zip.file('word/numbering.xml');
    if (numF) {
      const nd = parseXml(await numF.async('string'));
      const abs = {};
      for (const a of desc(nd, 'abstractNum')) {
        abs[attr(a, 'abstractNumId')] = Object.fromEntries(kids(a, 'lvl').map(l => [attr(l, 'ilvl'), {
          fmt: attr(kid(l, 'numFmt'), 'val'),
          left: Number(attr(kid(kid(l, 'pPr'), 'ind'), 'left') || attr(kid(kid(l, 'pPr'), 'ind'), 'start')) || 0,
        }]));
      }
      for (const n of desc(nd, 'num')) numFmt[attr(n, 'numId')] = abs[attr(kid(n, 'abstractNumId'), 'val')] || {};
    }
    const on = (el) => el && !/^(0|false|off)$/i.test(attr(el, 'val') || '');

    function runText(r) {
      let t = '';
      for (const c of r.children) {
        if (c.localName === 't') t += c.textContent;
        else if (c.localName === 'tab') t += ' ';
        else if (c.localName === 'br' || c.localName === 'cr') t += '\n';
      }
      return t;
    }
    function paraInfo(p) {
      const pPr = kid(p, 'pPr');
      const sid = attr(kid(pPr, 'pStyle'), 'val') || '';
      const name = styleName[sid] || sid.toLowerCase();
      let heading = 0;
      let m;
      if (/^title$/.test(name)) heading = 1;
      else if ((m = /^(?:heading|제목)\s?(\d)$/.exec(name)) || (m = /^heading(\d)$/.exec(sid.toLowerCase()))) heading = Math.min(Number(m[1]) + (Object.values(styleName).includes('title') ? 1 : 0), 6);
      const ol = attr(kid(pPr, 'outlineLvl'), 'val');
      if (!heading && ol != null && Number(ol) < 6) heading = Number(ol) + 1;
      const numPr = kid(pPr, 'numPr');
      let list = null;
      if (numPr) {
        const lvl = Number(attr(kid(numPr, 'ilvl'), 'val')) || 0, id = attr(kid(numPr, 'numId'), 'val');
        const def = (numFmt[id] || {})[String(lvl)] || {};
        const ind = kid(pPr, 'ind');
        const left = Number(attr(ind, 'left') || attr(ind, 'start')) || def.left || 0;
        list = { lvl, id, fmt: def.fmt || 'bullet', left };
      }
      // 하이퍼링크·변경 추적 안의 글자도 포함 (삭제된 글자는 w:delText 라 빠진다)
      const segs = desc(p, 'r').map(r => ({ text: runText(r), bold: on(kid(kid(r, 'rPr'), 'b')) })).filter(s => s.text);
      const plain = segs.map(s => s.text).join('');
      const allBold = plain.trim() && segs.filter(s => s.bold).reduce((n, s) => n + s.text.length, 0) >= plain.length * 0.8;
      const inline = segs.map(s => wrapBold(s.text, s.bold && !allBold)).join('').replace(/\*\*\s*\*\*/g, '');
      return { heading, list, plain: plain.trim(), inline: inline.trim(), allBold };
    }
    function table(tbl) {
      const grid = [];
      for (const tr of kids(tbl, 'tr')) {
        const row = [];
        for (const tc of kids(tr, 'tc')) {
          const tcPr = kid(tc, 'tcPr');
          const span = Number(attr(kid(tcPr, 'gridSpan'), 'val')) || 1;
          const vm = kid(tcPr, 'vMerge');
          const cont = vm && attr(vm, 'val') !== 'restart';
          const text = cont ? '' : desc(tc, 'p').map(p => paraInfo(p).plain).filter(Boolean).join(' ');
          row.push(text);
          for (let i = 1; i < span; i++) row.push('');
        }
        grid.push(row);
      }
      return grid;
    }

    const blocks = [];
    const counters = {};
    function walk(container) {
      for (const el of container.children) {
        if (el.localName === 'p') {
          const pi = paraInfo(el);
          if (!pi.plain) continue;
          if (pi.heading) { blocks.push('#'.repeat(pi.heading) + ' ' + mdEsc(pi.plain.replace(/\n/g, ' '))); continue; }
          if (pi.list) { blocks.push({ li: pi.list, text: pi.inline }); continue; }
          blocks.push(pi.allBold && pi.plain.length < 60 ? `**${mdEsc(pi.plain)}**` : mdEsc(pi.inline).replace(/\n/g, '  \n'));
        } else if (el.localName === 'tbl') {
          blocks.push(tableMd(table(el)));
        } else if (el.localName === 'sdt') {
          walk(kid(el, 'sdtContent') || el);
        }
      }
    }
    walk(kid(doc.documentElement, 'body'));

    // 목록 단계: ilvl 이 모두 0 이어도 들여쓰기 폭이 다르면 단계로 본다
    const lefts = [...new Set(blocks.filter(b => b && b.li).map(b => Math.round(b.li.left / 200)))].sort((a, b) => a - b);
    const lvOf = (li) => Math.min(Math.max(li.lvl, lefts.indexOf(Math.round(li.left / 200))), 5);
    // 이어지는 목록 묶음마다 가장 얕은 단계를 0으로 맞춘다
    const base = new Map();
    for (let i = 0; i < blocks.length;) {
      if (!blocks[i] || !blocks[i].li) { i++; continue; }
      let j = i, min = 9;
      while (j < blocks.length && blocks[j] && blocks[j].li) { min = Math.min(min, lvOf(blocks[j].li)); j++; }
      for (let k = i; k < j; k++) base.set(k, min);
      i = j;
    }
    const out = blocks.map((b, i) => {
      if (!b || !b.li) return b;
      const { li, text } = b;
      const lv = lvOf(li) - (base.get(i) || 0);
      for (const k of Object.keys(counters)) if (Number(k.split(':')[1]) > lv) delete counters[k];
      const indent = '   '.repeat(lv);
      if (li.fmt === 'bullet' || li.fmt === 'none') return `${indent}- ${text}`;
      const key = li.id + ':' + lv;
      counters[key] = (counters[key] || 0) + 1;
      return `${indent}${counters[key]}. ${text}`;
    });
    const pics = desc(doc, 'drawing').length;
    const warnings = pics ? [{ level: 'warn', msg: `그림 ${pics}개는 마크다운에 넣지 못했어요.` }] : [];
    return { markdown: joinBlocks(out), pages: null, unit: '', warnings };
  }

  /* ================= 파워포인트 PPTX ================= */
  async function pptx(zip) {
    const rels = async (path) => {
      const f = zip.file(path);
      if (!f) return {};
      const d = parseXml(await f.async('string'));
      return Object.fromEntries(desc(d, 'Relationship').map(r => [attr(r, 'Id'), { target: attr(r, 'Target'), type: attr(r, 'Type') || '' }]));
    };
    const resolve = (base, target) => {
      const parts = base.split('/'); parts.pop();
      for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
      return parts.join('/');
    };

    // 발표 순서
    const pres = parseXml(await zip.file('ppt/presentation.xml').async('string'));
    const presRels = await rels('ppt/_rels/presentation.xml.rels');
    let slides = desc(pres, 'sldId').map(s => presRels[attr(s, 'id')]?.target).filter(Boolean).map(t => resolve('ppt/presentation.xml', t));
    if (!slides.length) slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    const paraText = (ap) => {
      let t = '';
      for (const c of ap.children) {
        if (c.localName === 'r' || c.localName === 'fld') t += desc(c, 't').map(x => x.textContent).join('');
        else if (c.localName === 'br') t += ' ';
      }
      return t.trim();
    };
    const pos = (sp) => {
      const off = desc(sp, 'off')[0];
      return off ? [Number(attr(off, 'y')) || 0, Number(attr(off, 'x')) || 0] : [0, 0];
    };

    const blocks = [];
    const emptySlides = [];
    let n = 0;
    for (const path of slides) {
      const f = zip.file(path);
      if (!f) continue;
      n++;
      const sd = parseXml(await f.async('string'));
      const shapes = [...desc(sd, 'sp'), ...desc(sd, 'graphicFrame')].sort((a, b) => { const [ay, ax] = pos(a), [by, bx] = pos(b); return ay - by || ax - bx; });
      let title = '';
      const body = [];
      for (const sp of shapes) {
        if (sp.localName === 'graphicFrame') {
          const tbl = desc(sp, 'tbl')[0];
          if (tbl) body.push(tableMd(kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => desc(tc, 'p').map(paraText).filter(Boolean).join(' ')))));
          continue;
        }
        const ph = desc(sp, 'ph')[0];
        const type = attr(ph, 'type') || '';
        const ps = desc(kid(sp, 'txBody'), 'p').map(ap => ({ text: paraText(ap), lvl: Number(attr(kid(ap, 'pPr'), 'lvl')) || 0 })).filter(x => x.text);
        if (!ps.length) continue;
        if (!title && /^(title|ctrTitle)$/.test(type)) { title = ps.map(x => x.text).join(' '); continue; }
        if (type === 'subTitle' || ps.length === 1) { body.push(...ps.map(x => mdEsc(x.text))); continue; }
        body.push(ps.map(x => `${'  '.repeat(x.lvl)}- ${x.text}`).join('\n'));
      }
      // 발표자 노트
      const sRels = await rels(path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
      const noteRel = Object.values(sRels).find(r => /notesSlide$/.test(r.type));
      let notes = '';
      if (noteRel) {
        const nf = zip.file(resolve(path, noteRel.target));
        if (nf) {
          const nd = parseXml(await nf.async('string'));
          notes = desc(nd, 'sp').filter(sp => attr(desc(sp, 'ph')[0], 'type') === 'body')
            .flatMap(sp => desc(sp, 'p').map(paraText)).filter(Boolean).join(' ');
        }
      }
      // 제목 칸이 없으면 맨 위의 짧은 글을 제목으로
      if (!title && body.length && !/\n/.test(body[0]) && body[0].length <= 40 && !body[0].startsWith('|')) title = body.shift();
      if (!title && !body.length && !notes) { emptySlides.push(n); continue; }
      blocks.push(`## ${n}. ${title || '(제목 없음)'}`, ...body);
      if (notes) blocks.push(`> 발표자 노트: ${notes}`);
    }
    const warnings = emptySlides.length
      ? [{ level: 'warn', msg: `글자가 없는 슬라이드 ${emptySlides.length}장(${emptySlides.slice(0, 12).join(', ')}${emptySlides.length > 12 ? ' …' : ''})은 그림으로만 되어 있어 뺐어요.` }]
      : [];
    return { markdown: joinBlocks(blocks), pages: n, unit: '슬라이드', warnings };
  }

  /* ---------- 공개 API ---------- */
  async function convert(buf, ext) {
    let zip;
    try { zip = await JSZip.loadAsync(buf); } catch (e) { throw new Error('zip'); }
    const fn = { hwpx, docx, pptx }[ext];
    if (!fn) throw new Error('unsupported');
    const r = await fn(zip);
    if (!r.markdown.trim()) r.warnings.push({ level: 'error', msg: '글자를 찾지 못했어요. 빈 문서이거나 그림으로만 된 문서일 수 있어요.' });
    return { removedLines: 0, title: '', ...r };
  }

  window.OFFICE2MD = { convert };
})();
