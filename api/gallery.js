const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = process.env.ADMIN_PASSWORD;
const BUCKET = "galeria";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function auth(req) {
  return (req.headers["x-admin-password"] || "") === ADMIN;
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.body === "object") {
    return req.body;
  }
  return {};
}

module.exports = async (req, res) => {
  try {

    // 👉 LISTAR
    if (req.method === "GET") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/galeria?select=*`, {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
        },
      });

      const txt = await r.text();
      const data = txt ? JSON.parse(txt) : [];

      return json(res, 200, { rows: data });
    }

    // 👉 AUTH
    if (!auth(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const body = getBody(req);

    // 👉 CREATE
    if (body.action === "create") {

      const base64 = String(body.imagenBase64 || "")
        .replace(/^data:.*;base64,/, "");

      if (!base64) {
        return json(res, 400, { error: "Falta imagen" });
      }

      const buffer = Buffer.from(base64, "base64");

      const path = `galeria/${Date.now()}.jpg`;

      const upload = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
        {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            "content-type": "image/jpeg",
          },
          body: buffer,
        }
      );

      if (!upload.ok) {
        const err = await upload.text();
        return json(res, 500, { error: err });
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

      const insert = await fetch(`${SUPABASE_URL}/rest/v1/galeria`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          {
            titulo: body.titulo || "",
            descripcion: body.descripcion || "",
            imagen_url: publicUrl,
          },
        ]),
      });

      if (!insert.ok) {
        const err = await insert.text();
        return json(res, 500, { error: err });
      }

      return json(res, 200, { ok: true });
    }

    // 👉 DELETE
    if (body.action === "delete") {
      await fetch(
        `${SUPABASE_URL}/rest/v1/galeria?id=eq.${body.id}`,
        {
          method: "DELETE",
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
          },
        }
      );

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Acción inválida" });

  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
