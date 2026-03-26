// Vercel Serverless Function: GET /api/admin/list-blocked
// Requires env vars:
// - ADMIN_PASSWORD
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Lists rows from public.reservas with status = "blocked"

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const pass = req.headers["x-admin-password"];
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return json(res, 500, { error: "ADMIN_PASSWORD no está configurada en Vercel." });
  }

  if (!same(String(pass || ""), String(expected))) {
    return json(res, 401, { error: "No autorizado." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, {
      error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.",
    });
  }

  try {
    const endpoint =
      supabaseUrl.replace(/\/+$/, "") +
      "/rest/v1/reservas?select=id,checkin,checkout,nombre,personas,total,status,created_at&status=eq.blocked&checkin=not.is.null&checkout=not.is.null&order=checkin.asc";

    const r = await fetch(endpoint, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });

    const txt = await r.text();
    let rows;

    try {
      rows = JSON.parse(txt);
    } catch {
      rows = [];
    }

    if (!r.ok) {
      return json(res, 200, { rows: [] });
    }

    return json(res, 200, { rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    return json(res, 200, { rows: [] });
  }
};
