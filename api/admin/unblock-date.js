// Vercel Serverless Function: POST /api/admin/unblock-date
// Requires env vars:
// - ADMIN_PASSWORD
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Updates a blocked row in public.reservas setting status = "cancelled" so dates become available.

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
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const pass = req.headers["x-admin-password"];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return json(res, 500, { error: "ADMIN_PASSWORD no está configurada en Vercel." });
  if (!same(String(pass || ""), String(expected))) return json(res, 401, { error: "No autorizado." });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel." });

  let body = "";
  for await (const chunk of req) body += chunk;
  let data;
  try { data = JSON.parse(body || "{}"); } catch { return json(res, 400, { error: "JSON inválido." }); }

  const id = String(data.id || "").trim();
  if (!id) return json(res, 400, { error: "Falta id." });

  try {
    const endpoint = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/reservas?id=eq." + encodeURIComponent(id);

    const r = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });

    const txt = await r.text();
    if (!r.ok) return json(res, 400, { error: "Supabase update error", details: txt });

    let out;
    try { out = JSON.parse(txt); } catch { out = txt; }
    return json(res, 200, { ok: true, updated: out });
  } catch (e) {
    return json(res, 500, { error: "Error conectando a Supabase", details: String(e?.message || e) });
  }
};
