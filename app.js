// === LIGHTBOX INDEPENDIENTE (no interfiere con el resto) ===
(function(){
  document.addEventListener('click', function(e){
    var img = e.target && (e.target.tagName === 'IMG' ? e.target : e.target.closest && e.target.closest('img'));
    if(!img) return;
    var gallery = img.closest && img.closest('.gallery');
    if(!gallery) return;
    var lb = document.getElementById('lightbox');
    var lbImg = document.getElementById('lightbox-img') || (lb && lb.querySelector('img'));
    if(!lb || !lbImg) return;
    lbImg.src = img.currentSrc || img.src;
    lb.classList.add('open');
  });
  var lb = document.getElementById('lightbox');
  if(lb){
    lb.addEventListener('click', function(){
      lb.classList.remove('open');
    });
  }
})();

const yyEl = document.getElementById('yy');
if (yyEl) yyEl.textContent = String(new Date().getFullYear());

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

  const CFG = window.AGUARA_CONFIG || {
    precioBaseNoche: 180000,
    personasIncluidas: 6,
    precioExtraPorPersona: 30000,
    senia: 30000
  };

  const SENIA = Number(CFG.senia || 0);

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
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      occupied.add(toISODate(d));
    }
  }

  function rangeHasOccupied(checkin, checkout) {
    if (!checkin || !checkout) return false;
    const start = new Date(checkin + "T00:00:00");
    const end = new Date(checkout + "T00:00:00");
    if (isNaN(start) || isNaN(end) || start >= end) return false;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
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
    } catch (e) {}
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

  loadOccupied().then(() => {
    initPickers();
    recalc();
  });

  function money(n) {
    try {
      return n.toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
      });
    } catch {
      return '$' + String(n);
    }
  }

  function nights(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const a = new Date(checkin + 'T00:00:00');
    const b = new Date(checkout + 'T00:00:00');
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  function totalFor(personas, noches) {
    const base = Number(CFG.precioBaseNoche || 0);
    const incluidas = Number(CFG.personasIncluidas || 0);
    const extraPorPersona = Number(CFG.precioExtraPorPersona || 0);
    const extra = Math.max(0, (personas || 1) - incluidas) * extraPorPersona;
    return (base + extra) * Math.max(0, noches || 0);
  }

  function updatePayButtonText() {
    if (payBtn) {
      payBtn.textContent = `Pagar seña ${money(SENIA)} y reservar`;
    }
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

  updatePayButtonText();
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
      checkin,
      checkout,
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
      updatePayButtonText();
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
    const notas = (data.get('notas') || '').toString().trim();
    const mensaje = (data.get('mensaje') || '').toString().trim();

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
// === CLIMA Y ESTADO DEL RÍO ===
(function(){
  const section = document.getElementById('clima-rio');
  if (!section) return;

  const $ = (id) => document.getElementById(id);
  const weatherCodes = {
    0:['Despejado','☀️'],1:['Mayormente despejado','🌤️'],2:['Parcialmente nublado','⛅'],3:['Nublado','☁️'],
    45:['Niebla','🌫️'],48:['Niebla con escarcha','🌫️'],51:['Llovizna leve','🌦️'],53:['Llovizna','🌦️'],55:['Llovizna intensa','🌧️'],
    61:['Lluvia leve','🌧️'],63:['Lluvia','🌧️'],65:['Lluvia intensa','🌧️'],80:['Chaparrones leves','🌦️'],81:['Chaparrones','🌧️'],82:['Chaparrones fuertes','⛈️'],
    95:['Tormenta','⛈️'],96:['Tormenta con granizo','⛈️'],99:['Tormenta fuerte con granizo','⛈️']
  };

  function codeInfo(code){ return weatherCodes[Number(code)] || ['Condiciones variables','🌤️']; }
  function round(value){ return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '--'; }
  function localDate(value){
    if (!value) return 'Sin horario informado';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});
  }

  function renderWeather(weather){
    const current = weather.current || {};
    const daily = weather.daily || {};
    const info = codeInfo(current.weather_code);
    $('weatherIcon').textContent = info[1];
    $('weatherTemp').textContent = `${round(current.temperature_2m)}°`;
    $('weatherDescription').textContent = info[0];
    $('weatherFeels').textContent = `${round(current.apparent_temperature)}°`;
    $('weatherHumidity').textContent = `${round(current.relative_humidity_2m)}%`;
    $('weatherWind').textContent = `${round(current.wind_speed_10m)} km/h`;
    $('weatherGust').textContent = `${round(current.wind_gusts_10m)} km/h`;
    $('weatherRain').textContent = `${round(daily.precipitation_probability_max?.[0])}%`;
    $('weatherSunset').textContent = daily.sunset?.[0]?.slice(11,16) || '--:--';
    $('weatherUpdated').textContent = `Actualizado ${localDate(current.time)}`;

    const days = daily.time || [];
    $('forecastDays').innerHTML = days.slice(0,7).map((date,i) => {
      const dayName = new Date(`${date}T12:00:00`).toLocaleDateString('es-AR',{weekday:'short'}).replace('.','');
      const dayInfo = codeInfo(daily.weather_code?.[i]);
      return `<div class="forecast-day">
        <div class="forecast-day__name">${dayName}</div>
        <span class="forecast-day__icon" aria-hidden="true">${dayInfo[1]}</span>
        <div class="forecast-day__temps"><strong>${round(daily.temperature_2m_max?.[i])}°</strong> / ${round(daily.temperature_2m_min?.[i])}°</div>
        <span class="forecast-day__rain">💧 ${round(daily.precipitation_probability_max?.[i])}%</span>
      </div>`;
    }).join('');
  }

  function trendLabel(trend){
    if (!trend || trend.direction === 'unknown') return ['→','Sin tendencia disponible'];
    if (trend.direction === 'up') return ['↑',`Sube ${Math.abs(trend.changeCm)} cm`];
    if (trend.direction === 'down') return ['↓',`Baja ${Math.abs(trend.changeCm)} cm`];
    return ['→','Estable'];
  }

  function renderRivers(rivers){
    const cards = $('riverCards');
    cards.innerHTML = rivers.map(r => {
      if (!r.available) return `<article class="river-card river-card--error">
        <span class="river-card__river">${r.river || 'Lectura oficial'}</span><h3>${r.name}</h3>
        <p>No fue posible obtener una lectura automática en este momento.</p>
        <p class="data-updated">${r.message || 'Intentá nuevamente más tarde.'}</p>
      </article>`;
      const t = trendLabel(r.trend);
      return `<article class="river-card">
        <span class="river-card__river">${r.river}</span><h3>${r.name}</h3>
        <div class="river-level"><strong>${Number(r.value).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>${r.unit || 'm'}</span></div>
        <div class="river-trend"><span aria-hidden="true">${t[0]}</span>${t[1]}</div>
        <p class="data-updated">Lectura: ${localDate(r.time)}</p>
      </article>`;
    }).join('');
  }

  async function loadClimateRiver(){
    const button = $('refreshClimateRiver');
    if (button){ button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      const response = await fetch('/api/climate-river', {cache:'no-store'});
      if (!response.ok) throw new Error('Servicio temporalmente no disponible');
      const data = await response.json();
      if (data.weather) renderWeather(data.weather);
      renderRivers(data.rivers || []);
    } catch (error) {
      $('weatherDescription').textContent = 'No pudimos cargar el pronóstico';
      $('weatherUpdated').textContent = 'Revisá tu conexión o intentá nuevamente.';
      $('forecastDays').innerHTML = '<div class="forecast-skeleton">Pronóstico temporalmente no disponible.</div>';
      renderRivers([
        {name:'Reconquista',river:'Río Paraná',available:false},{name:'Puerto Iguazú',river:'Río Iguazú',available:false},{name:'Andresito',river:'Río Iguazú',available:false}
      ]);
    } finally {
      if (button){ button.disabled = false; button.textContent = 'Actualizar datos'; }
    }
  }

  $('refreshClimateRiver')?.addEventListener('click', loadClimateRiver);
  loadClimateRiver();
})();
