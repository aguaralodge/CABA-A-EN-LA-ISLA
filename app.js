document.getElementById('yy').textContent = new Date().getFullYear();
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
menuBtn?.addEventListener('click',()=>{
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
});
const lightbox = document.getElementById('lightbox');
const lightImg = lightbox.querySelector('img');
document.getElementById('gallery').addEventListener('click', (e)=>{
  const img = e.target.closest('img'); if(!img) return;
  lightImg.src = img.src; lightbox.classList.add('open');
});
lightbox.addEventListener('click', ()=> lightbox.classList.remove('open'));
const form = document.getElementById('formReserva');
form.addEventListener('submit',(e)=>{
  e.preventDefault();
  const data = new FormData(form);
  const nombre = data.get('nombre')||'';
  const personas = data.get('personas')||'';
  const ingreso = data.get('ingreso')||'';
  const egreso = data.get('egreso')||'';
  const actividad = data.get('actividad')||'';
  const tel = data.get('tel')||'';
  const mensaje = (data.get('mensaje')||'').toString().trim();
  const txt = `Hola Aguara Lodge!%0A%0A`+
    `Soy *${nombre}*. Quisiera consultar disponibilidad.%0A`+
    `• Personas: ${personas}%0A`+
    `• Ingreso: ${ingreso}%0A`+
    `• Egreso: ${egreso}%0A`+
    `• Actividad: ${actividad}%0A`+
    (tel?`• Tel: ${tel}%0A`:``)+
    (mensaje?`%0AComentarios:%0A${encodeURIComponent(mensaje)}`:``);
  const waNumber = '5493482632269';
  const url = `https://wa.me/${waNumber}?text=${txt}`;
  window.open(url,'_blank');
});

// --- Reserva automática (seña fija) ---
const autoForm = document.getElementById('formAutoReserva');
const elCheckin = document.getElementById('checkin');
const elCheckout = document.getElementById('checkout');
const elPersonas = document.getElementById('personasAuto');
const elNoches = document.getElementById('pNoches');
const elTotal = document.getElementById('pTotal');
const elSaldo = document.getElementById('pSaldo');
const elStatus = document.getElementById('autoStatus');
const btnPagar = document.getElementById('btnPagarSena');

const SENIA = 25000;
const BASE_NOCHE = 150000;
const EXTRA_PAX = 25000;

function moneyARS(n){
  try{
    return new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
  }catch{
    return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')}`;
  }
}

function parseDate(v){
  // v: 'YYYY-MM-DD' -> Date UTC-ish to avoid TZ edge cases
  if(!v) return null;
  const [y,m,d] = v.split('-').map(Number);
  if(!y||!m||!d) return null;
  return new Date(Date.UTC(y, m-1, d));
}

function diffNights(ci, co){
  if(!ci || !co) return 0;
  const ms = co.getTime() - ci.getTime();
  return Math.round(ms / (1000*60*60*24));
}

function calcTotal(personas, noches){
  const p = Number(personas||0);
  const n = Number(noches||0);
  if(p<=0 || n<=0) return 0;
  const porNoche = BASE_NOCHE + Math.max(0, p - 6) * EXTRA_PAX;
  return porNoche * n;
}

function refreshPrice(){
  const ci = parseDate(elCheckin?.value);
  const co = parseDate(elCheckout?.value);
  const noches = diffNights(ci, co);
  const personas = Number(elPersonas?.value || 0);

  if(noches <= 0){
    elNoches.textContent = '–';
    elTotal.textContent = '–';
    elSaldo.textContent = '–';
    if(btnPagar) btnPagar.disabled = true;
    return;
  }

  const total = calcTotal(personas, noches);
  const saldo = Math.max(0, total - SENIA);

  elNoches.textContent = String(noches);
  elTotal.textContent = moneyARS(total);
  elSaldo.textContent = moneyARS(saldo);
  if(btnPagar) btnPagar.disabled = false;
}

[elCheckin, elCheckout, elPersonas].forEach(el => el?.addEventListener('change', refreshPrice));
[elCheckin, elCheckout, elPersonas].forEach(el => el?.addEventListener('input', refreshPrice));
refreshPrice();

autoForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  elStatus.textContent = '';
  btnPagar.disabled = true;
  btnPagar.textContent = 'Generando pago...';

  const fd = new FormData(autoForm);
  const payload = {
    checkin: fd.get('checkin'),
    checkout: fd.get('checkout'),
    personas: Number(fd.get('personas')),
    nombre: (fd.get('nombre')||'').toString().trim(),
    email: (fd.get('email')||'').toString().trim(),
    tel: (fd.get('tel')||'').toString().trim(),
  };

  try{
    const r = await fetch('/api/create-preference', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(data?.error || 'No se pudo iniciar el pago.');

    // Redirige a Mercado Pago
    window.location.href = data.init_point;
  }catch(err){
    elStatus.textContent = (err?.message || 'Error inesperado. Probá de nuevo.');
    btnPagar.disabled = false;
    btnPagar.textContent = 'Pagar seña y reservar';
  }
});
