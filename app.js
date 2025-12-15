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

// --- Reservas: calculadora + pago de seña (Mercado Pago) ---
const ingresoEl = document.getElementById('ingreso');
const egresoEl = document.getElementById('egreso');
const personasEl = document.getElementById('personas');
const payBtn = document.getElementById('payBtn');
const outNoches = document.getElementById('calcNoches');
const outTotal = document.getElementById('calcTotal');
const outSaldo = document.getElementById('calcSaldo');

if(ingresoEl && egresoEl && personasEl && payBtn && outNoches && outTotal && outSaldo){

  const SENIA = 25000;
  function money(n){
    try { return n.toLocaleString('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:0}); }
    catch { return '$' + String(n); }
  }
  function nights(checkin, checkout){
    if(!checkin || !checkout) return 0;
    const a = new Date(checkin + 'T00:00:00');
    const b = new Date(checkout + 'T00:00:00');
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000*60*60*24));
  }
  function totalFor(personas, noches){
    const base = 150000;
    const extra = Math.max(0, (personas||1) - 6) * 25000;
    return (base + extra) * Math.max(0, noches||0);
  }
  function recalc(){
    const p = parseInt(personasEl?.value || '0', 10) || 0;
    const n = nights(ingresoEl?.value, egresoEl?.value);
    const total = totalFor(p, n);
    const saldo = Math.max(0, total - SENIA);
    if(outNoches) outNoches.textContent = n>0 ? String(n) : '-';
    if(outTotal) outTotal.textContent = n>0 ? money(total) : '-';
    if(outSaldo) outSaldo.textContent = n>0 ? money(saldo) : '-';
    if(payBtn) payBtn.disabled = !(n>0 && p>=1);
  }
  ingresoEl?.addEventListener('change', recalc);
  egresoEl?.addEventListener('change', recalc);
  personasEl?.addEventListener('change', recalc);
  recalc();

  payBtn?.addEventListener('click', async ()=>{
    recalc();
    const p = parseInt(personasEl?.value || '0', 10) || 0;
    const checkin = ingresoEl?.value;
    const checkout = egresoEl?.value;
    const n = nights(checkin, checkout);
    if(!(n>0 && p>=1)) return;

    const data = new FormData(document.getElementById('formReserva'));
    const payload = {
      nombre: (data.get('nombre')||'').toString(),
      tel: (data.get('tel')||'').toString(),
      email: (data.get('email')||'').toString(),
      personas: p,
      checkin, checkout,
      noches: n,
      total: totalFor(p, n),
      senia: SENIA
    };

    payBtn.disabled = true;
    payBtn.textContent = 'Generando pago...';
    try{
      const r = await fetch('/api/create-preference', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j?.error || 'No se pudo iniciar el pago');
      if(j?.init_point){
        window.location.href = j.init_point;
        return;
      }
      throw new Error('Respuesta inválida de Mercado Pago');
    }catch(err){
      alert(err?.message || 'Error al iniciar el pago');
      payBtn.disabled = false;
      payBtn.textContent = 'Pagar seña $25.000 y reservar';
    }
  });

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
}
