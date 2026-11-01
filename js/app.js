/* ==================================================================
   쏘다 공통: 탭 전환, 알림(toast), 클립보드 복사
   ================================================================== */
(function () {
  const TAB_KEY = 'ssoda.tab';

  function goTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.tab === name));
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* 무시 */ }
    window.scrollTo({ top: 0 });
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  window.SSODA = { goTab, toast, copy };

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (e) { /* 무시 */ }
  if (saved && document.querySelector(`.tab-page[data-tab="${saved}"]`)) goTab(saved);
})();
