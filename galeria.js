const cont = document.getElementById("galeria");

const fotos = [
  {src:"assets/gal1.jpg", titulo:"Cabaña", desc:"Vista general"},
  {src:"assets/gal2.jpg", titulo:"Río", desc:"Atardecer"},
];

cont.innerHTML = fotos.map(f=>`
<div style="margin:10px">
  <img src="${f.src}" style="width:300px;border-radius:10px">
  <h4>${f.titulo}</h4>
  <p>${f.desc}</p>
</div>
`).join("");
