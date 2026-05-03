(() => {
  const form = document.getElementById('admin-filter-form');
  const container = document.getElementById('candidates-table-container');
  const countEl = document.getElementById('candidates-count');
  if (!form || !container) return;

  let debounceTimer = null;
  let inFlightController = null;

  function buildParams() {
    const params = new URLSearchParams(new FormData(form));
    // strip empty values for cleanliness
    for (const [k, v] of [...params.entries()]) {
      if (!v) params.delete(k);
    }
    return params;
  }

  async function fetchAndReplace() {
    const params = buildParams();
    const fetchParams = new URLSearchParams(params);
    fetchParams.set('fragment', '1');

    if (inFlightController) inFlightController.abort();
    inFlightController = new AbortController();

    container.style.opacity = '0.5';
    try {
      const res = await fetch(`/admin?${fetchParams.toString()}`, {
        headers: { Accept: 'text/html' },
        signal: inFlightController.signal,
      });
      if (!res.ok) return;
      const html = await res.text();
      container.innerHTML = html;

      // Update URL (without fragment param)
      const newUrl = params.toString() ? `/admin?${params.toString()}` : '/admin';
      history.replaceState(null, '', newUrl);

      // Update count from new fragment if present
      const totalAttr = res.headers.get('x-total-count');
      if (totalAttr && countEl) {
        countEl.textContent = `(${totalAttr})`;
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally {
      container.style.opacity = '';
    }
  }

  const qInput = form.querySelector('input[name="q"]');
  qInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndReplace, 200);
  });

  form.querySelectorAll('select').forEach((sel) => {
    sel.addEventListener('change', fetchAndReplace);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    fetchAndReplace();
  });
})();
