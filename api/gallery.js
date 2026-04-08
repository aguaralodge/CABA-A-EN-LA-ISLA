const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = process.env.ADMIN_PASSWORD;
const BUCKET = process.env.SUPABASE_GALLERY_BUCKET || "galeria";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function auth(req) {
  return req.headers["x-admin-password"] === ADMIN;
}

async function list() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/galeria?select=*&order=created_at.desc`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  return await r.json();
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const rows = await list();
      return json(res, 200, { rows });
    }

    if (!auth(req)) return json(res, 401, { error: "Unauthorized" });

    const body = JSON.parse(req.body || "{}");
    const { action } = body;

    if (action === "create") {
      const buffer = Buffer.from(body.imagenBase64.split(",")[1], "base64");

      const path = `galeria/${Date.now()}.jpg`;

      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "content-type": "image/jpeg"
        },
        body: buffer
      });

      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

      const r = await fetch(`${SUPABASE_URL}/rest/v1/galeria`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify([{ titulo: body.titulo, descripcion: body.descripcion, imagen_url: url }])
      });

      return json(res, 200, { ok: true });
    }

    if (action === "delete") {
      await fetch(`${SUPABASE_URL}/rest/v1/galeria?id=eq.${body.id}`, {
        method: "DELETE",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`
        }
      });

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Acción inválida" });

  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
