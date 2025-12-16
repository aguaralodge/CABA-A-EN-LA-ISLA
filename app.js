document.getElementById('yy')?.textContent = new Date().getFullYear();

const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
menuBtn?.addEventListener('click', () => {
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
});
// ===== LIGHTBOX DEFINITIVO =====
document.addEventListener('click', (e) => {
  const img = e.target.tagName === 'IMG'
    ? e.target
    : e.target.closest('img');

  if (!img) return;

  const gallery = img.closest('.gallery');
  if (!gallery) return;

  const lightbox = document.getElementById('lightbox');
  const lightImg = document.getElementById('lightbox-img');

  if (!lightbox || !lightImg) return;

  lightImg.src = img.src;
  lightbox.classList.add('open');
});

document.getElementById('lightbox')?.addEventListener('click', () => {
  document.getElementById('lightbox').classList.remove('open');
});

// --- Reservas: calculadora + pago de seña (Mercado Pago) ---
const ingresoEl = document.getElementById('ingreso');
const egresoEl = document.getElementById('egreso');
const personasEl = document.getElementById('personas');
const payBtn = document.getElementById('payBtn');
const outNoches = document.getElementById('calcNoches');
const outTotal = document.getElementById('calcTotal');
const outSaldo = document.getElementById('calcSaldo');

if (ingresoEl && egresoEl && personasEl && payBtn && outNoches && outTotal && outSaldo) {

  // Fechas ocupadas (reservas aprobadas + bloqueos manuales)
  let occupied = new Set();

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }
  function addRange(checkin, checkout) {
    if (!checkin || !checkout) return;
    const start = new Date(checkin + "T00:00:00");
    const end = new Date(checkout + "T00:00:00");
    if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) return;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      occupied.add(toISODate(d));
    }
  }

  function rangeHasOccupied(checkin, checkout) {
    if (!checkin || !checkout) return false;
    const start = new Date(checkin + "T00:00:00");
    const end = new Date(checkout + "T00:00:00");
    if (isNaN(start) || isNaN(end) || start >= end) return false;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      if (occupied.has(toISODate(d))) return true;
    }
    return false;
  }

  async function loadOccupied() {
    try {
      const r = await fetch('/api/blocked-dates');
      if (!r.ok) return;
      const data = await r.json();
      (data?.ranges || []).forEach(x => addRange(x.checkin, x.checkout));
    } catch (e) { }
  }

  function isOccupied(date) {
    const iso = (typeof date === 'string') ? date : toISODate(date);
    return occupied.has(iso);
  }

  function initPickers() {
    if (!window.flatpickr) return;
    const common = {
      dateFormat: "Y-m-d",
      disableMobile: true,
      disable: [
        function (date) { return isOccupied(date); }
      ],
      onDayCreate: function (dObj, dStr, fp, dayElem) {
        const iso = dayElem.dateObj ? toISODate(dayElem.dateObj) : null;
        if (iso && occupied.has(iso)) {
          dayElem.classList.add('is-occupied');
        }
      }
    };

    let fpEgreso = null;

    fpEgreso = window.flatpickr(egresoEl, {
      ...common,
      minDate: "today",
      onChange: function () { recalc(); }
    });

    const fpIngreso = window.flatpickr(ingresoEl, {
      ...common,
      minDate: "today",
      onChange: function (selectedDates) {
        const sel = selectedDates?.[0];
        if (!sel) return;
        const minOut = new Date(sel);
        minOut.setDate(minOut.getDate() + 1);
        fpEgreso.set('minDate', minOut);

        const outSel = fpEgreso.selectedDates?.[0];
        if (outSel && outSel <= sel) {
          fpEgreso.clear();
        }
        recalc();
      }
    });

    window.__fpIngreso = fpIngreso;
    window.__fpEgreso = fpEgreso;
  }

  const SENIA = 25000;
  loadOccupied().then(() => { initPickers(); recalc(); });

  function money(n) {
    try { return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }); }
    catch { return '$' + String(n); }
  }
  function nights(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const a = new Date(checkin + 'T00:00:00');
    const b = new Date(checkout + 'T00:00:00');
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
  function totalFor(personas, noches) {
    const base = 150000;
    const extra = Math.max(0, (personas || 1) - 6) * 25000;
    return (base + extra) * Math.max(0, noches || 0);
  }
  function recalc() {
    const p = parseInt(personasEl?.value || '0', 10) || 0;
    const n = nights(ingresoEl?.value, egresoEl?.value);
    const total = totalFor(p, n);
    const saldo = Math.max(0, total - SENIA);
    if (outNoches) outNoches.textContent = n > 0 ? String(n) : '-';
    if (outTotal) outTotal.textContent = n > 0 ? money(total) : '-';
    if (outSaldo) outSaldo.textContent = n > 0 ? money(saldo) : '-';
    const occ = rangeHasOccupied(ingresoEl?.value, egresoEl?.value);
    if (payBtn) payBtn.disabled = !(n > 0 && p >= 1 && !occ);
  }

  ingresoEl?.addEventListener('change', recalc);
  egresoEl?.addEventListener('change', recalc);
  personasEl?.addEventListener('change', recalc);
  recalc();

  payBtn?.addEventListener('click', async () => {
    recalc();
    const p = parseInt(personasEl?.value || '0', 10) || 0;
    const checkin = ingresoEl?.value;
    const checkout = egresoEl?.value;
    const n = nights(checkin, checkout);
    if (!(n > 0 && p >= 1)) return;
    if (rangeHasOccupied(checkin, checkout)) {
      alert('Esas fechas ya están ocupadas o bloqueadas. Elegí otras, por favor.');
      return;
    }

    const data = new FormData(document.getElementById('formReserva'));
    const payload = {
      nombre: (data.get('nombre') || '').toString(),
      tel: (data.get('tel') || '').toString(),
      email: (data.get('email') || '').toString(),
      notas: (data.get('notas') || '').toString().trim(),
      personas: p,
      checkin, checkout,
      noches: n,
      total: totalFor(p, n),
      senia: SENIA
    };

    payBtn.disabled = true;
    payBtn.textContent = 'Generando pago...';
    try {
      const r = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'No se pudo iniciar el pago');
      if (j?.init_point) {
        window.location.href = j.init_point;
        return;
      }
      throw new Error('Respuesta inválida de Mercado Pago');
    } catch (err) {
      alert(err?.message || 'Error al iniciar el pago');
      payBtn.disabled = false;
      payBtn.textContent = 'Pagar seña $25.000 y reservar';
    }
  });

  const form = document.getElementById('formReserva');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const nombre = data.get('nombre') || '';
    const personas = data.get('personas') || '';
    const ingreso = data.get('ingreso') || '';
    const egreso = data.get('egreso') || '';
    const tel = data.get('tel') || '';
    const notas = (data.get('notas') || '').toString().trim();     // <- FIX
    const mensaje = (data.get('mensaje') || '').toString().trim(); // puede no existir, no rompe

    const txt = `Hola Aguara Lodge!%0A%0A` +
      `Soy *${nombre}*. Quisiera consultar disponibilidad.%0A` +
      `• Personas: ${personas}%0A` +
      `• Ingreso: ${ingreso}%0A` +
      `• Egreso: ${egreso}%0A` +
      (notas ? `• Notas: ${encodeURIComponent(notas)}%0A` : ``) +
      (tel ? `• Tel: ${tel}%0A` : ``) +
      (mensaje ? `%0AComentarios:%0A${encodeURIComponent(mensaje)}` : ``);

    const waNumber = '5493482632269';
    const url = `https://wa.me/${waNumber}?text=${txt}`;
    window.open(url, '_blank');
  });
}
