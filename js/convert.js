/* ==================================================================
   화면 동작: 파일 받기 → 변환 → 미리보기/원문/복사/저장
   ================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const files = [];   // {name, status, progress, result, error, edited}
  let current = -1;
  let view = 'preview';

  // 미리보기에서 PDF 속 HTML이 실행되지 않도록 그대로 글자로 보여 준다
  const escHtml = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  marked.use({ gfm: true, breaks: false, renderer: { html: (t) => escHtml(typeof t === 'string' ? t : t.text) } });

  const toast = (msg) => SSODA.toast(msg);

  const unitText = (r) => r.pages ? `${r.pages}${r.unit ?? '쪽'} · ` : '';

  function mdName(f) {
    return f.name.replace(/\.(pdf|hwpx|docx|pptx)$/i, '') + '.md';
  }

  /* ---------- 파일 받기 ---------- */
  const drop = $('drop');
  $('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  async function addFiles(list) {
    const all = [...list];
    if (all.some(f => /\.hwp$/i.test(f.name))) {
      toast('HWP는 바로 열 수 없어요. 한글에서 [다른 이름으로 저장 → HWPX]로 저장한 뒤 올려 주세요');
    }
    const pdfs = all.filter(f => /\.(pdf|hwpx|docx|pptx)$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) { if (!all.some(f => /\.hwp$/i.test(f.name))) toast('PDF·HWPX·DOCX·PPTX 파일만 올릴 수 있어요'); return; }
    $('resultCard').classList.remove('hidden');
    const start = files.length;
    for (const f of pdfs) files.push({ file: f, name: f.name, status: 'wait', progress: 0 });
    if (current < 0) current = start;
    render();
    for (let i = start; i < files.length; i++) await run(i);
  }

  function options() {
    return {
      stripHeaders: $('optHeaders').checked,
      tables: $('optTables').checked,
      bold: $('optBold').checked,
      pageMarks: $('optPages').checked,
    };
  }

  async function run(i) {
    const f = files[i];
    f.status = 'run'; f.progress = 0; f.error = null; f.edited = null;
    render();
    try {
      const buf = await f.file.arrayBuffer();
      const ext = (f.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
      f.result = ext === 'pdf' || !ext
        ? await PDF2MD.convert(buf, options(), (n, total) => { f.progress = n / total; f.total = total; renderFiles(); })
        : await OFFICE2MD.convert(buf, ext);
      f.status = 'done';
    } catch (e) {
      console.error(e);
      f.status = 'error';
      f.error = /password/i.test(e && e.name + e.message)
        ? '암호가 걸린 파일은 열 수 없어요.'
        : e && e.message === 'zip'
          ? '파일을 열지 못했어요. 암호가 걸렸거나 손상된 파일일 수 있어요.'
          : '파일을 읽지 못했어요. 손상됐거나 지원하지 않는 형식일 수 있어요.';
    }
    render();
  }

  // 옵션을 바꾸면 이미 변환한 파일을 다시 변환
  ['optHeaders', 'optTables', 'optBold', 'optPages'].forEach(id => $(id).addEventListener('change', async () => {
    for (let i = 0; i < files.length; i++) if (files[i].status === 'done') await run(i);
  }));

  /* ---------- 그리기 ---------- */
  function renderFiles() {
    $('fileList').innerHTML = '';
    files.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'file' + (i === current ? ' active' : '');
      let s = '', cls = '';
      if (f.status === 'wait') s = '대기 중';
      else if (f.status === 'run') s = f.total ? `변환 중… ${Math.round(f.progress * f.total)}/${f.total}쪽` : '여는 중…';
      else if (f.status === 'error') { s = '실패'; cls = 'err'; }
      else {
        const w = f.result.warnings;
        cls = w.some(x => x.level === 'error') ? 'err' : w.length ? 'warn' : 'ok';
        s = unitText(f.result) + (cls === 'ok' ? '완료' : '확인 필요');
      }
      b.innerHTML = `<div class="file-n"></div><div class="file-s ${cls}"></div>` +
        (f.status === 'run' ? `<div class="bar"><i style="width:${f.progress * 100}%"></i></div>` : '');
      b.querySelector('.file-n').textContent = f.name;
      b.querySelector('.file-s').textContent = s;
      b.title = f.name;
      b.onclick = () => { current = i; render(); };
      $('fileList').appendChild(b);
    });
    $('btnDownloadAll').hidden = files.filter(f => f.status === 'done').length < 2;
  }

  function currentMd() {
    const f = files[current];
    if (!f || f.status !== 'done') return '';
    return f.edited != null ? f.edited : f.result.markdown;
  }

  function render() {
    renderFiles();
    const f = files[current];
    const warns = $('warns'), stats = $('stats');
    warns.innerHTML = ''; stats.textContent = '';
    const ready = f && f.status === 'done';
    $('btnCopy').disabled = $('btnDownload').disabled = $('btnToPrompt').disabled = $('btnToHwp').disabled = !ready;

    if (!f || f.status === 'wait' || f.status === 'run') {
      $('preview').innerHTML = '<div class="empty">변환하는 중이에요…</div>';
      $('source').value = '';
    } else if (f.status === 'error') {
      $('preview').innerHTML = '';
      const d = document.createElement('div'); d.className = 'empty'; d.textContent = f.error;
      $('preview').appendChild(d);
      $('source').value = '';
    } else {
      for (const w of f.result.warnings) {
        const d = document.createElement('div');
        d.className = 'w ' + w.level; d.textContent = (w.level === 'error' ? '⚠️ ' : '💡 ') + w.msg;
        warns.appendChild(d);
      }
      const md = currentMd();
      stats.textContent = `${unitText(f.result)}${md.length.toLocaleString()}자` +
        (f.result.removedLines ? ` · 머리글/바닥글 ${f.result.removedLines}줄 지움` : '') +
        (f.edited != null ? ' · 직접 고침' : '');
      $('preview').innerHTML = marked.parse(md);
      if (document.activeElement !== $('source')) $('source').value = md;
    }
    $('preview').classList.toggle('hidden', view !== 'preview');
    $('source').classList.toggle('hidden', view !== 'source');
  }

  /* ---------- 탭·버튼 ---------- */
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    view = t.dataset.view;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    render();
  }));

  $('source').addEventListener('input', () => {
    const f = files[current];
    if (f && f.status === 'done') { f.edited = $('source').value; }
  });
  $('source').addEventListener('blur', render);

  $('btnCopy').addEventListener('click', async () => {
    toast(await SSODA.copy(currentMd()) ? '마크다운을 복사했어요' : '복사하지 못했어요. 원문 탭에서 직접 복사해 주세요');
  });

  // 변환 결과를 한글 탭으로 넘기기
  $('btnToHwp').addEventListener('click', () => {
    const f = files[current];
    if (!f || f.status !== 'done') return;
    SSODA_HWP.load(currentMd(), f.name);
    SSODA.goTab('tohwp');
  });

  // 변환 결과를 프롬프트 탭의 참고 자료로 넘기기
  $('btnToPrompt').addEventListener('click', () => {
    const f = files[current];
    if (!f || f.status !== 'done') return;
    SSODA_PROMPT.attachSource(f.name, currentMd());
    SSODA.goTab('prompt');
    toast('📎 참고 자료로 넣었어요. 양식을 고르고 조건을 채워 주세요');
  });

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('btnDownload').addEventListener('click', () => {
    const f = files[current];
    if (f && f.status === 'done') download(mdName(f), currentMd());
  });
  $('btnDownloadAll').addEventListener('click', () => {
    files.forEach((f, i) => {
      if (f.status !== 'done') return;
      setTimeout(() => download(mdName(f), f.edited != null ? f.edited : f.result.markdown), i * 300);
    });
  });
})();
