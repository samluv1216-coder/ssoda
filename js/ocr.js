/* ==================================================================
   글자 인식(OCR) — 스캔 PDF·사진에서 글자 읽기
   - tesseract.js(한국어+영어)를 처음 쓸 때만 불러온다
   - 인식은 브라우저 안에서 하고, 그림은 밖으로 보내지 않는다
     (처음 한 번 인식 데이터 약 10MB를 내려받아 브라우저에 보관)
   ================================================================== */
(function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
  let workerP = null;
  let onProgress = null;      // 지금 인식 중인 작업의 진행 표시

  function loadLib() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = resolve;
      s.onerror = () => reject(new Error('ocr-lib'));
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerP) {
      workerP = (async () => {
        await loadLib();
        return Tesseract.createWorker('kor+eng', 1, { logger: (m) => onProgress && onProgress(m) });
      })();
      workerP.catch(() => { workerP = null; });
    }
    return workerP;
  }

  // 줄바꿈 정리: 빈 줄은 문단 구분, 문단 안의 줄은 이어 붙인다
  function tidy(text) {
    return text.split(/\n\s*\n/)
      .map(p => p.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '))
      .filter(p => /[\p{L}\p{N}]/u.test(p))
      .join('\n\n');
  }

  // 진행 메시지를 사람이 읽기 쉬운 말로
  function describe(m) {
    if (!m || !m.status) return '';
    if (/loading tesseract core|initializ/i.test(m.status)) return '글자 인식 준비 중…';
    if (/loading language/i.test(m.status)) return `한국어 인식 데이터 받는 중… ${Math.round((m.progress || 0) * 100)}% (처음 한 번만)`;
    if (/recognizing/i.test(m.status)) return `글자 읽는 중… ${Math.round((m.progress || 0) * 100)}%`;
    return '';
  }

  // 줄 위치·높이로 문단/제목/번호 목록을 다시 나눈다
  const MARKER = /^(\d{1,2}[.)]|[가-하][.)]|\(\d{1,2}\)|[①-⑳]|[□■○●◦▪•※\-–―·∙])\s*/;
  function layout(data) {
    const lines = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const t = (l.text || '').replace(/\s+/g, ' ').trim();
      if (/[\p{L}\p{N}]/u.test(t)) lines.push({ t, y0: l.bbox.y0, y1: l.bbox.y1, x0: l.bbox.x0, h: l.bbox.y1 - l.bbox.y0 });
    }
    if (!lines.length) return tidy(data.text || '');
    const hs = lines.map(l => l.h).sort((a, b) => a - b);
    const mh = hs[Math.floor(hs.length / 2)] || 1;
    const blocks = [];
    let cur = null, prev = null, firstHead = true;
    for (const l of lines) {
      const gap = prev ? l.y0 - prev.y1 : Infinity;
      if (l.h > mh * 1.35 && l.t.length <= 40) {
        blocks.push((firstHead ? '# ' : '## ') + l.t); firstHead = false;
        cur = null; prev = l; continue;
      }
      const m = l.t.match(MARKER);
      if (m || !cur || gap > mh * 0.75) {
        let t = l.t;
        // 번호·기호는 마크다운 목록으로
        if (m && /^\d/.test(m[1])) t = m[1].replace(')', '.').replace(/\.?$/, '.') + ' ' + l.t.slice(m[0].length);
        else if (m && /^[□■○●◦▪•\-–―·∙]/.test(m[1])) t = '- ' + l.t.slice(m[0].length);
        else if (m) t = '- ' + l.t;
        cur = { t, li: !!m };
        blocks.push(cur);
      } else {
        cur.t += (/[A-Za-z]-$/.test(cur.t) ? '' : ' ') + l.t;
      }
      prev = l;
    }
    let out = '';
    blocks.forEach((b, i) => {
      const t = typeof b === 'string' ? b : b.t;
      const li = typeof b !== 'string' && b.li;
      const prevLi = i > 0 && typeof blocks[i - 1] !== 'string' && blocks[i - 1].li;
      out += (i ? (li && prevLi ? '\n' : '\n\n') : '') + t;
    });
    return out;
  }

  // 작은 사진은 키워서 읽어야 정확하다 (긴 변 약 2400px 로)
  async function prepare(source) {
    if (!(source instanceof Blob) || typeof createImageBitmap !== 'function') return source;
    try {
      const bmp = await createImageBitmap(source);
      const scale = Math.min(3, 2400 / Math.max(bmp.width, bmp.height));
      if (scale <= 1.15) { bmp.close && bmp.close(); return source; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      return c;
    } catch (e) { return source; }
  }

  async function recognize(source, progress) {
    onProgress = (m) => progress && progress(describe(m), m);
    source = await prepare(source);
    const w = await getWorker();
    const { data } = await w.recognize(source, {}, { text: true, blocks: true });
    onProgress = null;
    return { text: layout(data), confidence: Math.round(data.confidence || 0) };
  }

  // PDF 의 지정한 쪽들을 그림으로 그려서 읽는다
  async function pdfPages(buf, pages, progress) {
    const doc = await pdfjsLib.getDocument({ data: buf, cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/' }).promise;
    const out = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const page = await doc.getPage(pages[i]);
        // 인식률을 위해 약 200dpi 로 그린다 (너무 크면 느려지므로 긴 변 2600px 이하)
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.8, 2600 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
        const r = await recognize(canvas, (msg) => progress && progress(`${i + 1}/${pages.length}쪽 · ${msg}`));
        out.push({ page: pages[i], ...r });
      }
    } finally {
      await doc.destroy();
    }
    return out;
  }

  window.SSODA_OCR = { recognize, pdfPages };
})();
