/* ==================================================================
   마크다운 → 한글(HWPX) 변환 엔진
   - marked 로 마크다운을 읽고, OWPML(XML)을 만들어 JSZip 으로 묶는다
   - 제목·문단·굵게/기울임·목록·표·인용·코드·구분선 지원
   - 글자/문단 모양은 쓰는 만큼만 header.xml 에 등록한다
   ================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.MD2HWPX = factory(root.marked, root.JSZip);
})(typeof self !== 'undefined' ? self : this, function (marked, JSZip) {
  const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

  // A4, 여백: 좌우 30mm, 위 20mm, 아래 15mm (HWPUNIT: 1pt = 100)
  const PAGE = { w: 59528, h: 84186, left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252 };
  const TEXT_W = PAGE.w - PAGE.left - PAGE.right;

  const FONTS = { dotum: 0, batang: 1 };   // 0: 함초롬돋움, 1: 함초롬바탕

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- 글자·문단·테두리 모양 등록부 ---------- */
  function makeRegistry(opts) {
    const base = opts.baseSize || 1100;          // 본문 11pt
    const bodyFont = opts.bodyFont === 'dotum' ? FONTS.dotum : FONTS.batang;
    const chars = [], paras = [], fills = [];
    const charIdx = new Map(), paraIdx = new Map(), fillIdx = new Map();

    function fill(spec) {
      const key = JSON.stringify(spec);
      if (!fillIdx.has(key)) { fills.push(spec); fillIdx.set(key, fills.length); }  // id 는 1부터
      return fillIdx.get(key);
    }
    // 1: 빈 테두리(쪽), 2: 빈 테두리(글자) — 한글 기본 문서와 같은 번호
    fill({ none: true, tag: 'page' });
    fill({ none: true, tag: 'char' });

    function char(spec) {
      const s = { size: base, font: bodyFont, bold: false, italic: false, strike: false, underline: false, color: '#000000', ...spec };
      const key = JSON.stringify(s);
      if (!charIdx.has(key)) { charIdx.set(key, chars.length); chars.push(s); }
      return charIdx.get(key);
    }
    function para(spec) {
      const s = { align: 'JUSTIFY', left: 0, indent: 0, prev: 0, next: 0, line: 160, keepNext: false, border: 2, ...spec };
      const key = JSON.stringify(s);
      if (!paraIdx.has(key)) { paraIdx.set(key, paras.length); paras.push(s); }
      return paraIdx.get(key);
    }
    char({});        // 0: 바탕글 글자 모양
    para({});        // 0: 바탕글 문단 모양
    return { base, bodyFont, char, para, fill, chars, paras, fills };
  }

  /* ---------- header.xml ---------- */
  function borderXml(type, width, color) {
    return `type="${type}" width="${width}" color="${color}"`;
  }
  function headerXml(reg) {
    const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
    const fontfaces = LANGS.map(l =>
      `<hh:fontface lang="${l}" fontCnt="2"><hh:font id="0" face="함초롬돋움" type="TTF" isEmbedded="0"/><hh:font id="1" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>`).join('');

    const fills = reg.fills.map((f, i) => {
      const id = i + 1;
      const side = (k) => f[k] ? borderXml('SOLID', f[k].w || '0.12 mm', f[k].c || '#000000') : borderXml('NONE', '0.1 mm', '#000000');
      const brush = f.bg ? `<hc:fillBrush><hc:winBrush faceColor="${f.bg}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '';
      return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
        `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
        `<hh:leftBorder ${side('l')}/><hh:rightBorder ${side('r')}/><hh:topBorder ${side('t')}/><hh:bottomBorder ${side('b')}/>` +
        `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${brush}</hh:borderFill>`;
    }).join('');

    const seven = (v) => `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
    const chars = reg.chars.map((c, id) =>
      `<hh:charPr id="${id}" height="${c.size}" textColor="${c.color}" shadeColor="${c.shade || 'none'}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">` +
      `<hh:fontRef ${seven(c.font)}/><hh:ratio ${seven(100)}/><hh:spacing ${seven(0)}/><hh:relSz ${seven(100)}/><hh:offset ${seven(0)}/>` +
      (c.italic ? '<hh:italic/>' : '') + (c.bold ? '<hh:bold/>' : '') +
      `<hh:underline type="${c.underline ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${c.color}"/>` +
      `<hh:strikeout shape="${c.strike ? 'SOLID' : 'NONE'}" color="${c.color}"/>` +
      `<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`).join('');

    const margin = (p) => `<hh:margin><hc:intent value="${p.indent}" unit="HWPUNIT"/><hc:left value="${p.left}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="${p.prev}" unit="HWPUNIT"/><hc:next value="${p.next}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${p.line}" unit="HWPUNIT"/>`;
    const paras = reg.paras.map((p, id) =>
      `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
      `<hh:align horizontal="${p.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
      `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="${p.keepNext ? 1 : 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
      `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
      `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin(p)}</hp:case><hp:default>${margin(p)}</hp:default></hp:switch>` +
      `<hh:border borderFillIDRef="${p.border}" offsetLeft="${p.pad || 0}" offsetRight="${p.pad || 0}" offsetTop="${p.pad || 0}" offsetBottom="${p.pad || 0}" connect="${p.border > 2 ? 1 : 0}" ignoreMargin="0"/></hh:paraPr>`).join('');

    const ph = (lv, fmt, txt, chk) => `<hh:paraHead start="1" level="${lv}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="${fmt}" charPrIDRef="4294967295" checkable="${chk ? 1 : 0}">${txt}</hh:paraHead>`;
    const numbering = `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">` +
      ph(1, 'DIGIT', '^1.') + ph(2, 'HANGUL_SYLLABLE', '^2.') + ph(3, 'DIGIT', '^3)') + ph(4, 'HANGUL_SYLLABLE', '^4)') +
      ph(5, 'DIGIT', '(^5)') + ph(6, 'HANGUL_SYLLABLE', '(^6)') + ph(7, 'CIRCLED_DIGIT', '^7', true) +
      `</hh:numbering></hh:numberings>`;

    return XML_HEAD + `<hh:head ${NS} version="1.5" secCnt="1">` +
      `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
      `<hh:refList>` +
      `<hh:fontfaces itemCnt="7">${fontfaces}</hh:fontfaces>` +
      `<hh:borderFills itemCnt="${reg.fills.length}">${fills}</hh:borderFills>` +
      `<hh:charProperties itemCnt="${reg.chars.length}">${chars}</hh:charProperties>` +
      `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
      numbering +
      `<hh:paraProperties itemCnt="${reg.paras.length}">${paras}</hh:paraProperties>` +
      `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
      `</hh:refList>` +
      `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
      `<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>` +
      `<hh:trackchageConfig flags="56"/></hh:head>`;
  }

  /* ---------- 쪽 설정 (첫 문단에 들어감) ---------- */
  function secPrXml() {
    const pbf = (t) => `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`;
    return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
      `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>` +
      `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
      `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
      `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
      `<hp:pagePr landscape="WIDELY" width="${PAGE.w}" height="${PAGE.h}" gutterType="LEFT_ONLY"><hp:margin header="${PAGE.header}" footer="${PAGE.footer}" gutter="0" left="${PAGE.left}" right="${PAGE.right}" top="${PAGE.top}" bottom="${PAGE.bottom}"/></hp:pagePr>` +
      `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
      `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
      pbf('BOTH') + pbf('EVEN') + pbf('ODD') + `</hp:secPr>` +
      `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`;
  }

  /* ---------- 인라인 마크다운 → 글자 조각 ---------- */
  function inlineSegments(tokens, style, out = []) {
    for (const t of tokens || []) {
      switch (t.type) {
        case 'strong': inlineSegments(t.tokens, { ...style, bold: true }, out); break;
        case 'em': inlineSegments(t.tokens, { ...style, italic: true }, out); break;
        case 'del': inlineSegments(t.tokens, { ...style, strike: true }, out); break;
        case 'codespan': out.push({ text: decode(t.text), style: { ...style, code: true } }); break;
        case 'br': out.push({ br: true }); break;
        case 'link': inlineSegments(t.tokens, { ...style, link: true }, out); break;
        case 'image': out.push({ text: `[그림: ${t.text || t.href}]`, style }); break;
        case 'html': out.push({ text: t.text.replace(/<[^>]+>/g, ''), style }); break;
        case 'text':
          if (t.tokens && t.tokens.length) inlineSegments(t.tokens, style, out);
          else out.push({ text: decode(t.text), style });
          break;
        default: out.push({ text: decode(t.raw || t.text || ''), style });
      }
    }
    return out;
  }
  // marked 가 이스케이프한 엔티티를 원래 글자로
  function decode(s) {
    return String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
  }

  /* ---------- 본문 생성기 ---------- */
  function build(md, opts = {}) {
    const reg = makeRegistry(opts);
    const B = reg.base;
    const P = [];            // 완성된 <hp:p> 들
    let tblId = 1000;
    const plain = [];        // 미리보기 텍스트

    const charFor = (st, base) => reg.char({
      ...base,
      bold: !!(base.bold || st.bold), italic: !!(base.italic || st.italic), strike: !!st.strike,
      underline: !!st.link, color: st.link ? '#1D4ED8' : (base.color || '#000000'),
      ...(st.code ? { font: FONTS.dotum, shade: '#EEF2F7' } : {}),
    });

    function runs(segs, base) {
      let xml = '';
      for (const s of segs) {
        if (s.br) { xml += `<hp:run charPrIDRef="${reg.char(base)}"><hp:t><hp:lineBreak/></hp:t></hp:run>`; continue; }
        if (!s.text) continue;
        xml += `<hp:run charPrIDRef="${charFor(s.style || {}, base)}"><hp:t>${esc(s.text)}</hp:t></hp:run>`;
      }
      return xml || `<hp:run charPrIDRef="${reg.char(base)}"/>`;
    }
    function p(paraId, inner) {
      return `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${inner}</hp:p>`;
    }
    const segText = (segs) => segs.map(s => s.br ? '\n' : (s.text || '')).join('');

    // 글자 모양 묶음
    const BODY = {};
    const HEAD = [null,
      { size: Math.round(B * 1.6), font: FONTS.dotum, bold: true },
      { size: Math.round(B * 1.35), font: FONTS.dotum, bold: true },
      { size: Math.round(B * 1.15), font: FONTS.dotum, bold: true },
      { size: B, font: FONTS.dotum, bold: true },
      { size: B, font: FONTS.dotum, bold: true },
      { size: B, font: FONTS.dotum, bold: true }];
    const HEAD_PARA = [null,
      { align: opts.centerTitle === false ? 'LEFT' : 'CENTER', prev: 0, next: 1200, keepNext: true, line: 150 },
      { align: 'LEFT', prev: 1400, next: 600, keepNext: true, line: 150 },
      { align: 'LEFT', prev: 1000, next: 400, keepNext: true, line: 150 },
      { align: 'LEFT', prev: 800, next: 300, keepNext: true, line: 150 },
      { align: 'LEFT', prev: 600, next: 200, keepNext: true, line: 150 },
      { align: 'LEFT', prev: 600, next: 200, keepNext: true, line: 150 }];
    const BULLETS = ['•', '◦', '▪', '-'];

    function heading(t, firstH1) {
      const d = Math.min(t.depth, 6);
      const segs = inlineSegments(t.tokens, {});
      // 첫 번째 # 만 제목(가운데), 나머지 # 는 큰 소제목
      const pspec = d === 1 && !firstH1 ? { ...HEAD_PARA[2], prev: 1600 } : HEAD_PARA[d];
      P.push(p(reg.para(pspec), runs(segs, HEAD[d])));
      plain.push(segText(segs));
    }
    function paragraph(tokens, pspec = { next: 400 }, cbase = BODY) {
      const segs = inlineSegments(tokens, {});
      P.push(p(reg.para(pspec), runs(segs, cbase)));
      plain.push(segText(segs));
    }
    function list(t, level) {
      let n = typeof t.start === 'number' ? t.start : 1;
      for (const item of t.items) {
        const marker = t.ordered ? `${n++}.` : (item.task ? (item.checked ? '☑' : '☐') : BULLETS[Math.min(level, BULLETS.length - 1)]);
        const left = 600 + level * 1600;
        const hang = t.ordered ? 1500 : 1100;
        const pspec = { align: 'LEFT', left: left + hang, indent: -hang, next: 150 };
        let first = true;
        for (const sub of item.tokens) {
          if (sub.type === 'list') { list(sub, level + 1); continue; }
          if (sub.type === 'space') continue;
          const toks = sub.tokens || [{ type: 'text', text: sub.text || '' }];
          const segs = inlineSegments(toks, {});
          if (first) segs.unshift({ text: marker + ' ', style: {} });
          P.push(p(reg.para(first ? pspec : { ...pspec, indent: 0 }), runs(segs, BODY)));
          plain.push(segText(segs));
          first = false;
        }
        if (first) P.push(p(reg.para(pspec), runs([{ text: marker + ' ', style: {} }], BODY)));
      }
    }
    function table(t) {
      const cols = t.header.length;
      const colW = Math.floor(TEXT_W / cols);
      const rowH = Math.round(B * 2.2);
      const cellFill = reg.fill({ l: {}, r: {}, t: {}, b: {} });
      const headFill = reg.fill({ l: {}, r: {}, t: {}, b: {}, bg: '#E7EDF5' });
      const align = (a) => a === 'center' ? 'CENTER' : a === 'right' ? 'RIGHT' : 'LEFT';
      const cellBase = { size: Math.round(B * 0.92) };
      const rowsData = [t.header, ...t.rows];
      let trs = '';
      rowsData.forEach((row, r) => {
        let tcs = '';
        for (let c = 0; c < cols; c++) {
          const cell = row[c] || { tokens: [] };
          const head = r === 0;
          const segs = inlineSegments(cell.tokens, {});
          const pid = reg.para({ align: head ? 'CENTER' : align(t.align[c]), line: 130 });
          const inner = p(pid, runs(segs, head ? { ...cellBase, bold: true } : cellBase));
          tcs += `<hp:tc name="" header="${head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${head ? headFill : cellFill}">` +
            `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList>` +
            `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
            `<hp:cellSz width="${c === cols - 1 ? TEXT_W - colW * (cols - 1) : colW}" height="${rowH}"/>` +
            `<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
        }
        trs += `<hp:tr>${tcs}</hp:tr>`;
        plain.push(row.map(c => (c && c.text) || '').join('\t'));
      });
      const tbl = `<hp:tbl id="${tblId++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rowsData.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="${cellFill}" noAdjust="0">` +
        `<hp:sz width="${TEXT_W}" widthRelTo="ABSOLUTE" height="${rowH * rowsData.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
        `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
        `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>` +
        trs + `</hp:tbl>`;
      P.push(p(reg.para({ align: 'CENTER', next: 600, line: 100 }), `<hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>`));
    }
    function codeBlock(t) {
      const box = reg.fill({ l: { c: '#CBD5E1' }, r: { c: '#CBD5E1' }, t: { c: '#CBD5E1' }, b: { c: '#CBD5E1' }, bg: '#F5F7FA' });
      const pid = reg.para({ align: 'LEFT', line: 130, border: box, pad: 400, left: 400 });
      const cbase = { size: Math.round(B * 0.85), font: FONTS.dotum };
      const lines = t.text.split('\n');
      lines.forEach((ln) => P.push(p(pid, runs([{ text: ln || ' ', style: {} }], cbase))));
      P.push(p(reg.para({ line: 60 }), runs([], BODY)));
      plain.push(t.text);
    }
    function quote(t) {
      const bar = reg.fill({ l: { w: '1 mm', c: '#94A3B8' } });
      const pid = reg.para({ left: 800, border: bar, pad: 600, next: 200 });
      for (const sub of t.tokens) {
        if (sub.type === 'paragraph' || sub.type === 'text') paragraph(sub.tokens || [{ type: 'text', text: sub.text }], null, { color: '#475569' }, pid);
        else if (sub.type !== 'space') walk([sub]);
      }
      P.push(p(reg.para({ line: 60, next: 200 }), runs([], BODY)));
    }
    // 인용문 문단은 문단 모양을 직접 지정
    const _paragraph = paragraph;
    paragraph = function (tokens, pspec, cbase, pidOverride) {
      if (pidOverride == null) return _paragraph(tokens, pspec || { next: 400 }, cbase || BODY);
      const segs = inlineSegments(tokens, {});
      P.push(p(pidOverride, runs(segs, cbase || BODY)));
      plain.push(segText(segs));
    };
    function hr() {
      const line = reg.fill({ b: { c: '#94A3B8' } });
      P.push(p(reg.para({ border: line, next: 400, line: 60 }), runs([], { size: 400 })));
    }

    let firstH1 = true;
    function walk(tokens) {
      for (const t of tokens) {
        switch (t.type) {
          case 'heading': heading(t, firstH1 && t.depth === 1); if (t.depth === 1) firstH1 = false; break;
          case 'paragraph': paragraph(t.tokens); break;
          case 'text': paragraph(t.tokens || [{ type: 'text', text: t.text }]); break;
          case 'list': list(t, 0); P.push(p(reg.para({ line: 60, next: 200 }), runs([], BODY))); break;
          case 'table': table(t); break;
          case 'code': codeBlock(t); break;
          case 'blockquote': quote(t); break;
          case 'hr': hr(); break;
          case 'html': if (t.text.trim()) paragraph([{ type: 'text', text: t.text.replace(/<[^>]+>/g, '').trim() }]); break;
          default: break;   // space 등
        }
      }
    }

    const tokens = marked.lexer(md || '', { gfm: true });
    walk(tokens);
    if (!P.length) P.push(p(0, runs([], BODY)));

    // 첫 문단에 쪽 설정을 끼워 넣는다
    P[0] = P[0].replace(/^(<hp:p [^>]*>)/, `$1<hp:run charPrIDRef="0">${secPrXml()}</hp:run>`);

    const section = XML_HEAD + `<hs:sec ${NS}>` + P.join('') + `</hs:sec>`;
    return { header: headerXml(reg), section, plain: plain.join('\n') };
  }

  /* ---------- 패키지 파일 ---------- */
  function packageFiles(title, header, section, plain) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return {
      'version.xml': XML_HEAD + '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="12.0.0.0"/>',
      'META-INF/container.xml': XML_HEAD + '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>',
      'META-INF/manifest.xml': XML_HEAD + '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>',
      'META-INF/container.rdf': XML_HEAD + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/header.xml"/></rdf:Description><rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description><rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/section0.xml"/></rdf:Description><rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description><rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>',
      'Contents/content.hpf': XML_HEAD + `<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">쏘다(SSODA)</opf:meta><opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/><opf:meta name="lastsaveby" content="text">쏘다(SSODA)</opf:meta><opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta><opf:meta name="keyword" content="text"/></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`,
      'Contents/header.xml': header,
      'Contents/section0.xml': section,
      'Preview/PrvText.txt': plain.slice(0, 1000),
      'settings.xml': XML_HEAD + '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>',
    };
  }

  /* ---------- 공개 API ---------- */
  async function toHwpx(md, opts = {}) {
    const { header, section, plain } = build(md, opts);
    const title = opts.title || (plain.split('\n').find(l => l.trim()) || '문서').slice(0, 80);
    const zip = new JSZip();
    // mimetype 은 반드시 맨 앞, 압축하지 않음
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    const files = packageFiles(title, header, section, plain);
    for (const [name, body] of Object.entries(files)) zip.file(name, body, { createFolders: false });
    return zip.generateAsync({
      type: opts.type || 'blob', mimeType: 'application/hwp+zip',
      compression: 'DEFLATE', compressionOptions: { level: 6 },
    });
  }

  return { toHwpx, build };
});
