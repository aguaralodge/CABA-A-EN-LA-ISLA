(() => {
  const galleryEl = document.getElementById('gallery');
  const statusEl = document.getElementById('galleryStatus');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function cardHtml(row, i) {
    const title = row.titulo || `Foto ${i + 1}`;
    const desc = row.descripcion || '';
    const img = row.image_url || row.src || '';
    return `
      <article class="card gallery-card">
        <button class="gallery-item gallery-open" type="button" aria-label="Abrir ${esc(title)}">
          <img src="${esc(img)}" alt="${esc(title)}" loading="lazy" />
        </button>
        <div class="card__body">
          <span class="badge">Aguará Lodge</span>
          <h3 class="gallery-card__title">${esc(title)}</h3>
          ${desc ? `<p class="gallery-card__desc">${esc(desc)}</p>` : ''}
        </div>
      </article>
    `;
  }

  async function loadGallery() {
    if (!galleryEl) return;
    galleryEl.innerHTML = '<div class="muted">Cargando fotos…</div>';
    if (statusEl) statusEl.textContent = '';

    try {
      const r = await fetch('/api/gallery-list', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      const rows = Array.isArray(j.rows) ? j.rows : [];

      if (!rows.length) {
        galleryEl.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="card__body"><p class="muted">Todavía no hay fotos cargadas.</p></div></div>';
        return;
      }

      galleryEl.innerHTML = rows.map(cardHtml).join('');
      if (statusEl && j.fallback) {
        statusEl.textContent = 'Mostrando fotos base del sitio hasta que la galería de Supabase quede conectada.';
      }
    } catch (e) {
      galleryEl.innerHTML = '<div class="card" style="grid-column:1/-1"><div class="card__body"><p class="muted">No se pudo cargar la galería.</p></div></div>';
    }
  }

  loadGallery();
})();
