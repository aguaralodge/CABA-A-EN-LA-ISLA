(() => {
  const $ = (id) => document.getElementById(id);

  const KEY = "aguara_admin_pass";
  const state = {
    pass: sessionStorage.getItem(KEY) || "",
  };

  // 🔥 CONFIG GLOBAL
  const CFG = window.AGUARA_CONFIG || {
    precioBaseNoche: 180000,
    personasIncluidas: 6,
    precioExtraPorPersona: 30000,
    senia: 30000
  };

  function setAuthStatus() {
    const ok = !!state.pass;
    $("authStatus").textContent = ok
      ? "Sesión guardada en este navegador (hasta cerrar la pestaña)."
      : "Ingresá la contraseña para habilitar el bloqueo.";
  }

  function money(n) {
    try {
      return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
    } catch {
      return String(Math.round(n || 0));
    }
  }

  function pdfUrlForRef(ref) {
    return `/api/reservation-pdf?ref=${encodeURIComponent(ref || "")}`;
  }

  function downloadPdf(ref) {
    if (!ref) return;
    const url = pdfUrlForRef(ref);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = `comprobante-${ref}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function calc() {
    const checkin = $("checkin").value
      ? new Date($("checkin").value + "T00:00:00")
      : null;

    const checkout = $("checkout").value
      ? new Date($("checkout").value + "T00:00:00")
      : null;

    const personas = Math.min(
      12,
      Math.max(1, parseInt($("personas").value || "1", 10))
    );

    let noches = 0;
    if (checkin && checkout) {
      const ms = checkout.getTime() - checkin.getTime();
      noches = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    }

    // 🔥 NUEVO SISTEMA DE PRECIOS
    const base = CFG.precioBaseNoche;
    const extra = Math.max(0, personas - CFG.personasIncluidas) * CFG.precioExtraPorPersona;
    const total = (base + extra) * noches;

    $("noches").textContent = String(noches);
    $("total").textContent = money(total);
  }

  async function block() {
    $("msg").textContent = "";
    $("msg").style.opacity = "1";

    if (!state.pass) {
      $("msg").textContent = "Falta contraseña (sección Acceso).";
      return;
    }

    const payload = {
      checkin: $("checkin").value,
      checkout: $("checkout").value,
      personas: parseInt($("personas").value || "1", 10),
      nombre: $("nombre").value || null,
      tel: $("tel").value || null,
      nota: $("nota").value || null,
      status: "blocked",
    };

    if (!payload.checkin || !payload.checkout) {
      $("msg").textContent = "Elegí check-in y check-out.";
      return;
    }

    const nights = parseInt($("noches").textContent || "0", 10);
    if (!nights || nights < 1) {
      $("msg").textContent =
        "Check-out debe ser posterior al check-in (mínimo 1 noche).";
      return;
    }

    $("btnBlock").disabled = true;
    $("btnBlock").textContent = "Bloqueando...";

    try {
      const resp = await fetch("/api/admin/block-date", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-password": state.pass,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || "Error HTTP " + resp.status);
      }

      const ref = data.ref || "";
      const pdfUrl = data.pdf_url || pdfUrlForRef(ref);
      $("msg").innerHTML = ref
        ? `Listo ✅ Bloqueado (${ref}). <a href="${pdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>`
        : "Listo ✅ Bloqueado.";

      if (ref) {
        try { downloadPdf(ref); } catch (e) {}
      }

      try {
        await loadBlockedList();
      } catch (e) {}

    } catch (e) {
      $("msg").textContent = "No se pudo bloquear: " + (e?.message || e);
    } finally {
      $("btnBlock").disabled = false;
      $("btnBlock").textContent = "Bloquear fecha";
    }
  }

  function clearForm() {
    $("checkin").value = "";
    $("checkout").value = "";
    $("personas").value = "6";
    $("nombre").value = "";
    $("tel").value = "";
    $("nota").value = "";
    $("msg").textContent = "";
    calc();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
    );
  }

  function getNombreReserva(row) {
    return (
      row?.nombre ||
      row?.guest_name ||
      row?.titular ||
      row?.name ||
      ""
    );
  }

  async function loadBlockedList() {
    const listEl = document.getElementById("blockedList");
    if (!listEl) return;

    if (!state.pass) {
      listEl.innerHTML =
        '<div class="muted">Ingresá la contraseña para ver y gestionar los bloqueos.</div>';
      return;
    }

    listEl.innerHTML = '<div class="muted">Cargando…</div>';

    try {
      const r = await fetch("/api/admin/list-blocked", {
        headers: { "x-admin-password": state.pass },
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo cargar la lista");

      const rows = Array.isArray(j.rows) ? j.rows : [];

      if (rows.length === 0) {
        listEl.innerHTML =
          '<div class="muted">No hay fechas bloqueadas.</div>';
        return;
      }

      let html = "";
      html += '<table class="blocked-table">';
      html += "<thead><tr><th>Ingreso</th><th>Egreso</th><th>Nombre</th><th>Estado</th><th>Personas</th><th>Total</th><th>Comprobante</th><th></th></tr></thead>";
      html += "<tbody>";

      for (const row of rows) {
        const nombre = getNombreReserva(row);

        html += "<tr>";
        html += "<td>" + esc(row.checkin || "") + "</td>";
        html += "<td>" + esc(row.checkout || "") + "</td>";
        html += "<td>" + esc(nombre || "-") + "</td>";
        html += '<td>' + esc((row.status || '').replace('approved','Reserva web').replace('blocked','Bloqueada').replace('cash_pending','Pendiente efectivo') || '-') + '</td>';
        html += '<td style="text-align:center">' + esc(row.personas ?? "") + "</td>";
        html += "<td>" + esc(money(row.total ?? 0)) + "</td>";
        html += '<td style="text-align:center">' + (row.ref
          ? ('<a class="btn small ghost" href="' + esc(pdfUrlForRef(row.ref)) + '" target="_blank" rel="noopener">PDF</a>')
          : '-') + '</td>';
        html += '<td style="text-align:right">' + ((row.status === 'blocked')
          ? ('<button class="btn small" data-unblock="' + esc(row.id) + '">Desbloquear</button>')
          : '-') + '</td>';
        html += "</tr>";
      }

      html += "</tbody></table>";
      listEl.innerHTML = html;

    } catch (e) {
      listEl.innerHTML =
        '<div class="muted">Error: ' + esc(e.message || e) + "</div>";
    }
  }

  async function unblockById(id) {
    const r = await fetch("/api/admin/unblock-date", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-password": state.pass,
      },
      body: JSON.stringify({ id }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "No se pudo desbloquear");
    return j;
  }

  $("btnLogin").addEventListener("click", () => {
    const pass = $("adminPass").value || "";
    if (!pass) {
      $("authStatus").textContent = "Ingresá una contraseña.";
      return;
    }
    state.pass = pass;
    sessionStorage.setItem(KEY, pass);
    $("adminPass").value = "";
    setAuthStatus();
    loadBlockedList();
  });

  $("btnLogout").addEventListener("click", () => {
    state.pass = "";
    sessionStorage.removeItem(KEY);
    setAuthStatus();
  });

  ["checkin", "checkout", "personas"].forEach((id) =>
    $(id).addEventListener("input", calc)
  );

  $("btnBlock").addEventListener("click", block);
  $("btnClear").addEventListener("click", clearForm);

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-unblock]");
    if (!btn) return;

    ev.preventDefault();

    if (!state.pass) {
      alert("Ingresá la contraseña primero.");
      return;
    }

    const id = btn.getAttribute("data-unblock");
    if (!id) return;

    if (!confirm("¿Desbloquear esta fecha?")) return;

    btn.disabled = true;

    try {
      await unblockById(id);
      await loadBlockedList();
      const msg = document.getElementById("msg");
      if (msg) msg.textContent = "Fecha desbloqueada ✅";
    } catch (e) {
      alert("No se pudo desbloquear: " + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  });

  setAuthStatus();
  calc();
  loadBlockedList();
})();
