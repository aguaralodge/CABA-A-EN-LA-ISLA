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