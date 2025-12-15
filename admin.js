(() => {
  const $ = (id) => document.getElementById(id);

  const KEY = "aguara_admin_pass";
  const state = {
    pass: sessionStorage.getItem(KEY) || "",
  };

  function setAuthStatus() {
    const ok = !!state.pass;
    $("authStatus").textContent = ok ? "Sesión guardada en este navegador (hasta cerrar la pestaña)." : "Ingresá la contraseña para habilitar el bloqueo.";
  }

  function money(n) {
    try { return new Intl.NumberFormat("es-AR").format(Math.round(n || 0)); }
    catch { return String(Math.round(n || 0)); }
  }

  function calc() {
    const checkin = $("checkin").value ? new Date($("checkin").value + "T00:00:00") : null;
    const checkout = $("checkout").value ? new Date($("checkout").value + "T00:00:00") : null;
    const personas = Math.max(1, parseInt($("personas").value || "1", 10));
    let noches = 0;
    if (checkin && checkout) {
      const ms = checkout.getTime() - checkin.getTime();
      noches = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    }
    const base = 150000;
    const extra = Math.max(0, personas - 6) * 25000;
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
      $("msg").textContent = "Check-out debe ser posterior al check-in (mínimo 1 noche).";
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
        throw new Error(data?.error || ("Error HTTP " + resp.status));
      }

      $("msg").textContent = `Listo ✅ Bloqueado (${data.ref || "sin ref"}).`;
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

  // Auth controls
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
  });

  $("btnLogout").addEventListener("click", () => {
    state.pass = "";
    sessionStorage.removeItem(KEY);
    setAuthStatus();
  });

  // Form controls
  ["checkin", "checkout", "personas"].forEach((id) => $(id).addEventListener("input", calc));
  $("btnBlock").addEventListener("click", block);
  $("btnClear").addEventListener("click", clearForm);

  // init
  setAuthStatus();
  calc();
})();
