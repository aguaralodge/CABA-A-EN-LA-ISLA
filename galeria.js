const SUPABASE_URL = "https://otxdrvmfivfxxolheqqb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eTpaLeD2VbIts68TJFffJg_GtatjMrw";

async function cargarGaleria() {
  const cont = document.getElementById("galeria");
  cont.innerHTML = "Cargando...";

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

    if (!data.length) {
      cont.innerHTML = "No hay fotos todavía";
      return;
    }

    cont.innerHTML = data.map(f => `
      <div class="card">
        <img src="${f.imagen_url}">
        <h3>${f.titulo || ""}</h3>
        <p>${f.descripcion || ""}</p>
      </div>
    `).join("");

  } catch (e) {
    cont.innerHTML = "Error cargando galería";
  }
}

cargarGaleria();
