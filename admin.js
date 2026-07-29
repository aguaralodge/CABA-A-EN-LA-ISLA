(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "aguara_admin_pass";
  const state = { pass: sessionStorage.getItem(KEY) || "" };

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
      : "Ingresá la contraseña para habilitar las reservas manuales.";
  }

  function money(n) {
    try { return new Intl.NumberFormat("es-AR").format(Math.round(Number(n) || 0)); }
    catch { return String(Math.round(Number(n) || 0)); }
  }

  function pdfUrlForRef(ref) {
    return `/api/reservation-pdf?ref=${encodeURIComponent(ref || "")}`;
  }

  function downloadPdf(ref) {
    if (!ref) return;
    const a = document.createElement("a");
    a.href = pdfUrlForRef(ref);
    a.target = "_blank";
    a.rel = "noopener";
    a.download = `comprobante-${ref}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function getCalculatedValues() {
    const checkin = $("checkin").value ? new Date($("checkin").value + "T00:00:00") : null;
    const checkout = $("checkout").value ? new Date($("checkout").value + "T00:00:00") : null;
    const personas = Math.min(12, Math.max(1, parseInt($("personas").value || "1", 10)));
    let noches = 0;
    if (checkin && checkout) {
      noches = Math.max(0, Math.round((checkout.getTime() - checkin.getTime()) / 86400000));
    }
    const extra = Math.max(0, personas - CFG.personasIncluidas) * CFG.precioExtraPorPersona;
    const total = (CFG.precioBaseNoche + extra) * noches;
    const seniaIngresada = Math.max(0, Number($("senia").value || 0));
    const senia = Math.min(total, seniaIngresada);
    const saldo = Math.max(0, total - senia);
    const estado = total > 0 && saldo === 0 ? "Pagada completamente" : senia > 0 ? "Señada" : "Pendiente de seña";
    return { noches, personas, total, senia, saldo, estado };
  }

  function calc() {
    const v = getCalculatedValues();
    $("noches").textContent = String(v.noches);
    $("total").textContent = money(v.total);
    $("seniaResumen").textContent = money(v.senia);
    $("saldo").textContent = money(v.saldo);
    $("estado").textContent = v.estado;
    const seniaEl = $("senia");
    if (seniaEl && v.total > 0) seniaEl.max = String(v.total);
  }

  async function block() {
    $("msg").textContent = "";
    $("msg").style.opacity = "1";
    if (!state.pass) {
      $("msg").textContent = "Falta contraseña (sección Acceso).";
      return;
    }

    const values = getCalculatedValues();
    const payload = {
      checkin: $("checkin").value,
      checkout: $("checkout").value,
      personas: values.personas,
      nombre: $("nombre").value.trim() || null,
      tel: $("tel").value.trim() || null,
      senia: values.senia,
      payment_method: $("paymentMethod").value,
      status: "blocked"
    };

    if (!payload.checkin || !payload.checkout) {
      $("msg").textContent = "Elegí check-in y check-out.";
      return;
    }
    if (values.noches < 1) {
      $("msg").textContent = "Check-out debe ser posterior al check-in (mínimo 1 noche).";
      return;
    }
    if (Number($("senia").value || 0) > values.total) {
      $("msg").textContent = "La seña no puede ser mayor que el total de la estadía.";
      return;
    }

    $("btnBlock").disabled = true;
    $("btnBlock").textContent = "Guardando...";
    try {
      const resp = await fetch("/api/admin/block-date", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-password": state.pass },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Error HTTP " + resp.status);
      const ref = data.ref || "";
      const pdfUrl = data.pdf_url || pdfUrlForRef(ref);
      $("msg").innerHTML = ref
        ? `Reserva guardada ✅ (${esc(ref)}). <a href="${esc(pdfUrl)}" target="_blank" rel="noopener">Abrir PDF</a>`
        : "Reserva guardada ✅";
      if (ref) downloadPdf(ref);
      await loadBlockedList().catch(() => {});
    } catch (e) {
      $("msg").textContent = "No se pudo guardar: " + (e?.message || e);
    } finally {
      $("btnBlock").disabled = false;
      $("btnBlock").textContent = "Guardar reserva";
    }
  }

  function clearForm() {
    $("checkin").value = "";
    $("checkout").value = "";
    $("personas").value = "6";
    $("nombre").value = "";
    $("tel").value = "";
    $("senia").value = "0";
    $("paymentMethod").value = "efectivo";
    $("msg").textContent = "";
    calc();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function getNombreReserva(row) {
    return row?.nombre || row?.guest_name || row?.titular || row?.name || "";
  }

  function financialStatus(row) {
    const total = Number(row.total || 0);
    const senia = Number(row.senia || 0);
    const saldo = Number.isFinite(Number(row.saldo)) ? Number(row.saldo) : Math.max(0, total - senia);
    if (total > 0 && saldo <= 0) return "Pagada";
    if (senia > 0) return "Señada";
    return "Pendiente";
  }

  async function loadBlockedList() {
    const listEl = $("blockedList");
    if (!listEl) return;
    if (!state.pass) {
      listEl.innerHTML = '<div class="muted">Ingresá la contraseña para ver y gestionar las reservas.</div>';
      return;
    }
    listEl.innerHTML = '<div class="muted">Cargando…</div>';
    try {
      const r = await fetch("/api/admin/list-blocked", { headers: { "x-admin-password": state.pass } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo cargar la lista");
      const rows = Array.isArray(j.rows) ? j.rows : [];
      if (!rows.length) {
        listEl.innerHTML = '<div class="muted">No hay reservas cargadas.</div>';
        return;
      }
      let html = '<table class="blocked-table"><thead><tr><th>Ingreso</th><th>Egreso</th><th>Nombre</th><th>Estado</th><th>Personas</th><th>Total</th><th>Seña</th><th>Saldo</th><th>Comprobante</th><th></th></tr></thead><tbody>';
      for (const row of rows) {
        const nombre = getNombreReserva(row);
        const saldo = Number.isFinite(Number(row.saldo)) ? Number(row.saldo) : Math.max(0, Number(row.total || 0) - Number(row.senia || 0));
        html += "<tr>";
        html += "<td>" + esc(row.checkin || "") + "</td>";
        html += "<td>" + esc(row.checkout || "") + "</td>";
        html += "<td>" + esc(nombre || "-") + "</td>";
        html += "<td>" + esc(financialStatus(row)) + "</td>";
        html += '<td style="text-align:center">' + esc(row.personas ?? "") + "</td>";
        html += "<td>$" + esc(money(row.total ?? 0)) + "</td>";
        html += "<td>$" + esc(money(row.senia ?? 0)) + "</td>";
        html += "<td>$" + esc(money(saldo)) + "</td>";
        html += '<td style="text-align:center">' + (row.ref ? '<a class="btn small ghost" href="' + esc(pdfUrlForRef(row.ref)) + '" target="_blank" rel="noopener">PDF</a>' : "-") + "</td>";
        html += '<td style="text-align:right">' + (row.status === "blocked" ? '<button class="btn small" data-unblock="' + esc(row.id) + '">Cancelar</button>' : "-") + "</td>";
        html += "</tr>";
      }
      html += "</tbody></table>";
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = '<div class="muted">Error: ' + esc(e.message || e) + "</div>";
    }
  }

  async function unblockById(id) {
    const r = await fetch("/api/admin/unblock-date", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": state.pass },
      body: JSON.stringify({ id })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "No se pudo cancelar");
    return j;
  }

  $("btnLogin").addEventListener("click", () => {
    const pass = $("adminPass").value || "";
    if (!pass) { $("authStatus").textContent = "Ingresá una contraseña."; return; }
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
    loadBlockedList();
  });

  ["checkin", "checkout", "personas", "senia"].forEach(id => $(id).addEventListener("input", calc));
  $("btnBlock").addEventListener("click", block);
  $("btnClear").addEventListener("click", clearForm);

  document.addEventListener("click", async ev => {
    const btn = ev.target.closest("button[data-unblock]");
    if (!btn) return;
    ev.preventDefault();
    if (!state.pass) return alert("Ingresá la contraseña primero.");
    const id = btn.getAttribute("data-unblock");
    if (!id || !confirm("¿Cancelar esta reserva y liberar las fechas?")) return;
    btn.disabled = true;
    try {
      await unblockById(id);
      await loadBlockedList();
      $("msg").textContent = "Reserva cancelada y fechas liberadas ✅";
    } catch (e) {
      alert("No se pudo cancelar: " + (e.message || e));
    } finally { btn.disabled = false; }
  });

  setAuthStatus();
  calc();
  loadBlockedList();
})();
