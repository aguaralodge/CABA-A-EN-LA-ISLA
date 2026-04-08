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
      filename: file.name,
      mimeType: file.type || 'image/jpeg',
      dataBase64: dataUrl.split(',').pop(),
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
    if (!state.pass) {
      $('items').innerHTML = '<div class="muted">Ingresá la contraseña para ver las fotos.</div>';
      return;
    }
    $('items').innerHTML = '<div class="muted">Cargando…</div>';
    try {
      const j = await fetchJson('/api/admin/gallery-list', { cache: 'no-store' });
      state.rows = Array.isArray(j.rows) ? j.rows : [];
      renderItems(Boolean(j.fallback));
    } catch (e) {
      $('items').innerHTML = `<div class="muted">${esc(e.message || e)}</div>`;
    }
  }

  function renderItems(isFallback) {
    if (!state.rows.length) {
      $('items').innerHTML = '<div class="muted">Todavía no hay fotos cargadas.</div>';
      return;
    }

    $('items').innerHTML = state.rows.map((row, i) => `
      <article class="admin-gallery-card">
        <div class="admin-gallery-card__img">
          <img src="${esc(row.image_url || '')}" alt="${esc(row.titulo || `Foto ${i + 1}`)}" />
        </div>
        <div class="admin-gallery-card__body">
          <div class="admin-gallery-card__top">
            <span class="badge">${row.activa === false ? 'Oculta' : 'Activa'}</span>
            <span class="muted">Orden: ${esc(row.orden ?? '-')}</span>
          </div>
          <h3>${esc(row.titulo || `Foto ${i + 1}`)}</h3>
          <p>${esc(row.descripcion || 'Sin descripción')}</p>
          <div class="admin-gallery-card__actions">
            <button class="btn" type="button" data-edit="${esc(row.id)}">Editar</button>
            <button class="btn ghost" type="button" data-delete="${esc(row.id)}">Borrar</button>
          </div>
        </div>
      </article>
    `).join('');

    if (isFallback) {
      showMsg('Se está mostrando la galería base del sitio. Cuando cargues la tabla y el bucket en Supabase, acá aparecerán las fotos reales.', false);
    }
  }

  function startEdit(id) {
    const row = state.rows.find((x) => String(x.id) === String(id));
    if (!row) return;
    state.editingId = String(row.id);
    $('formTitle').textContent = 'Editar foto';
    $('saveBtn').textContent = 'Guardar cambios';
    $('galId').value = String(row.id || '');
    $('titulo').value = row.titulo || '';
    $('descripcion').value = row.descripcion || '';
    $('orden').value = row.orden ?? '';
    $('activa').checked = row.activa !== false;
    state.currentPreview = row.image_url || '';
    state.selectedFile = null;
    $('foto').value = '';
    setPreview(state.currentPreview);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    showMsg('');
    if (!state.pass) {
      showMsg('Primero guardá la contraseña.');
      return;
    }

    const titulo = $('titulo').value.trim();
    const descripcion = $('descripcion').value.trim();
    const ordenRaw = $('orden').value.trim();
    const activa = $('activa').checked;
    const file = $('foto').files?.[0] || null;

    if (!titulo) {
      showMsg('Poné un título.');
      return;
    }

    if (!state.editingId && !file) {
      showMsg('Elegí una foto.');
      return;
    }

    $('saveBtn').disabled = true;
    $('saveBtn').textContent = state.editingId ? 'Guardando…' : 'Subiendo…';

    try {
      const payload = {
        id: state.editingId || undefined,
        titulo,
        descripcion,
        orden: ordenRaw === '' ? null : Number(ordenRaw),
        activa,
      };

      if (file) Object.assign(payload, await fileToPayload(file));

      if (state.editingId) {
        await fetchJson('/api/admin/gallery-update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMsg('Foto actualizada ✅', true);
      } else {
        await fetchJson('/api/admin/gallery-create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMsg('Foto cargada ✅', true);
      }

      resetForm();
      await loadRows();
    } catch (e) {
      showMsg(e.message || String(e));
    } finally {
      $('saveBtn').disabled = false;
      $('saveBtn').textContent = state.editingId ? 'Guardar cambios' : 'Guardar foto';
    }
  }

  async function deleteRow(id) {
    if (!state.pass) {
      showMsg('Primero guardá la contraseña.');
      return;
    }
    if (!confirm('¿Borrar esta foto?')) return;
    try {
      await fetchJson('/api/admin/gallery-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      showMsg('Foto borrada ✅', true);
      if (state.editingId === String(id)) resetForm();
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
    const editBtn = ev.target.closest('[data-edit]');
    if (editBtn) return startEdit(editBtn.getAttribute('data-edit'));
    const delBtn = ev.target.closest('[data-delete]');
    if (delBtn) return deleteRow(delBtn.getAttribute('data-delete'));
  });

  renderAuth();
  resetForm();
  if (state.pass) loadRows();
})();
