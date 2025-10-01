
// Lightbox básico
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lightbox-img');
document.querySelectorAll('.gallery-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const img = btn.querySelector('img');
    lbImg.src = img.src;
    lb.classList.remove('hidden');
    lb.classList.add('flex');
  });
});
lb.addEventListener('click', () => {
  lb.classList.add('hidden');
  lb.classList.remove('flex');
  lbImg.src = '';
});
