(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'aguara_admin_pass';

  const state = {
    pass: sessionStorage.getItem(KEY) || '',
    rows: [],
    editingId: '',
    currentPreview: '',
    selectedFile: null,
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function setSession(pass) {
    state.pass = pass || '';
    if (state.pass) sessionStorage.setItem(KEY, state.pass);
    else sessionStorage.removeItem(KEY);
    renderAuth();
  }

  function renderAuth() {
    $('authStatus').textContent = state.pass
      ? 'Sesión guardada en este navegador.'
      : 'Ingresá la contraseña del admin para habilitar la galería.';
  }

  function showMsg(text, ok = false) {
    const el = $('msg');
    el.textContent = text || '';
    el.style.color = ok ? '#2f6f2f' : '#7a2f2f';
  }

  function resetForm() {
    state.editingId = '';
    state.currentPreview = '';
    state.selectedFile = null;

    $('formTitle').textContent = 'Cargar foto nueva';
    $('saveBtn').textContent = 'Guardar foto';
    $('galId').value = '';
    $('titulo').value = '';
    $('descripcion').value = '';
    $('orden').value = '';
    $('activa').checked = true;
    $('foto').value = '';
    $('previewWrap').style.display = 'none';
    $('preview').src = '';
  }

  function setPreview(src) {
    if (!src) {
      $('previewWrap').style.display = 'none';
      $('preview').src = '';
      return;
    }
    $('preview').src = src;
    $('previewWrap').style.display = 'block';
  }

  async function fileToPayload(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    return {
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      imagenBase64: dataUrl,
    };
  }

  async function fetchJson(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      'x-admin-password': state.pass,
    };

    const r = await fetch(url, { ...options, headers });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) throw new Error(j.error || `Error HTTP ${r.status}`);
    return j;
  }

  async function loadRows() {
    $('items').innerHTML = '<div class="muted">Cargando…</div>';

    try {
      const j = await fetchJson('/api/gallery', {
        method: 'GET',
        cache: 'no-store',
      });

      state.rows = Array.isArray(j.rows) ? j.rows : [];
      renderItems();
    } catch (e) {
      $('items').innerHTML = `<div class="muted">${esc(e.message || e)}</div>`;
    }
  }

  function renderItems() {
    if (!state.rows.length) {
      $('items').innerHTML = '<div class="muted">Todavía no hay fotos cargadas.</div>';
      return;
    }

    $('items').innerHTML = state.rows.map((row, i) => `
      <article class="admin-gallery-card">
        <div class="admin-gallery-card__img">
          <img src="${esc(row.image_url || row.imagen_url || '')}" alt="${esc(row.titulo || `Foto ${i + 1}`)}" />
        </div>
        <div class="admin-gallery-card__body">
          <div class="admin-gallery-card__top">
            <span class="badge">${row.activa === false ? 'Oculta' : 'Activa'}</span>
            <span class="muted">Orden: ${esc(row.orden ?? '-')}</span>
          </div>
          <h3>${esc(row.titulo || `Foto ${i + 1}`)}</h3>
          <p>${esc(row.descripcion || 'Sin descripción')}</p>
          <div class="admin-gallery-card__actions">
            <button class="btn ghost" type="button" data-delete="${esc(row.id)}">Borrar</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  async function save() {
    showMsg('');

    if (!state.pass) {
      showMsg('Primero guardá la contraseña.');
      return;
    }

    const titulo = $('titulo').value.trim();
    const descripcion = $('descripcion').value.trim();
    const file = $('foto').files?.[0] || null;

    if (!titulo) {
      showMsg('Poné un título.');
      return;
    }

    if (!file) {
      showMsg('Elegí una foto.');
      return;
    }

    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Subiendo…';

    try {
      const filePayload = await fileToPayload(file);

      const payload = {
        action: 'create',
        titulo,
        descripcion,
        imagenBase64: filePayload.imagenBase64,
        fileName: filePayload.fileName,
        mimeType: filePayload.mimeType,
      };

      await fetchJson('/api/gallery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      showMsg('Foto cargada ✅', true);
      resetForm();
      await loadRows();
    } catch (e) {
      showMsg(e.message || String(e));
    } finally {
      $('saveBtn').disabled = false;
      $('saveBtn').textContent = 'Guardar foto';
    }
  }

  async function deleteRow(id) {
    if (!state.pass) {
      showMsg('Primero guardá la contraseña.');
      return;
    }

    if (!confirm('¿Borrar esta foto?')) return;

    try {
      await fetchJson('/api/gallery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id,
        }),
      });

      showMsg('Foto borrada ✅', true);
      await loadRows();
    } catch (e) {
      showMsg(e.message || String(e));
    }
  }

  $('btnLogin').addEventListener('click', () => {
    const pass = $('adminPass').value.trim();

    if (!pass) {
      showMsg('Ingresá la contraseña.');
      return;
    }

    setSession(pass);
    $('adminPass').value = '';
    showMsg('Sesión guardada ✅', true);
    loadRows();
  });

  $('btnLogout').addEventListener('click', () => {
    setSession('');
    showMsg('Sesión cerrada.');
    $('items').innerHTML = '<div class="muted">Ingresá la contraseña para ver las fotos.</div>';
  });

  $('foto').addEventListener('change', () => {
    const file = $('foto').files?.[0] || null;
    state.selectedFile = file;

    if (!file) {
      setPreview(state.currentPreview || '');
      return;
    }

    const fr = new FileReader();
    fr.onload = () => setPreview(String(fr.result || ''));
    fr.readAsDataURL(file);
  });

  $('saveBtn').addEventListener('click', save);

  $('clearBtn').addEventListener('click', () => {
    resetForm();
    showMsg('');
  });

  document.addEventListener('click', (ev) => {
    const delBtn = ev.target.closest('[data-delete]');
    if (delBtn) return deleteRow(delBtn.getAttribute('data-delete'));
  });

  renderAuth();
  resetForm();
  loadRows();
})();
