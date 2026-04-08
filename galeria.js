const SUPABASE_URL = "https://otxdrvmfivfxxolheqqb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eTpaLeD2VbIts68TJFffJg_GtatjMrw";

async function cargarGaleria() {
  const cont = document.getElementById("galeria");

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/galeria?select=*&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await res.json();

    cont.innerHTML = data.map(f => `
      <article class="card">
        <img class="galeria-img" src="${f.imagen_url}" />
        <div class="card__body">
          <span class="badge">Galería</span>
          <h3>${f.titulo || ""}</h3>
          <p>${f.descripcion || ""}</p>
        </div>
      </article>
    `).join("");

  } catch (e) {
    cont.innerHTML = "<p>Error cargando galería</p>";
  }
}

cargarGaleria();
