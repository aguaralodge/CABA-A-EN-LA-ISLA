// Vercel Serverless Function: POST /api/admin/block-date
// Requires env vars:
// - ADMIN_PASSWORD
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Inserts a row into public.reservas with status "blocked" (cash/manual reservation)

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function same(a, b) {
  // basic constant-time-ish compare (good enough here)
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

function parseDate(d) {
  // expects YYYY-MM-DD
  if (!d || typeof d !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

function nights(checkin, checkout) {
  const a = new Date(checkin + "T00:00:00Z");
  const b = new Date(checkout + "T00:00:00Z");
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function calcTotal(n, personas) {
  const base = 150000;
  const extra = Math.max(0, (personas || 1) - 6) * 25000;
  return (base + extra) * n;
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
  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, { error: "Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel." });
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  let data;
  try {
    data = JSON.parse(body || "{}");
  } catch {
    return json(res, 400, { error: "JSON inválido." });
  }

  const checkin = parseDate(data.checkin);
  const checkout = parseDate(data.checkout);
  const personas = Math.max(1, parseInt(data.personas || 1, 10));
  const status = String(data.status || "blocked");

  if (!checkin || !checkout) return json(res, 400, { error: "checkin/checkout inválidos (YYYY-MM-DD)." });

  const n = nights(checkin, checkout);
  if (!n || n < 1) return json(res, 400, { error: "checkout debe ser posterior al checkin (mínimo 1 noche)." });

  const total = calcTotal(n, personas);

  const ref = `EFECTIVO-${checkin.replaceAll("-", "")}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

  const row = {
    ref,
    checkin,
    checkout,
    noches: n,
    personas,
    nombre: data.nombre || null,
    tel: data.tel || null,
    total,
    senia: 0,
    saldo: total,
    payment_id: null,
    status: status,
    // nota is not in table by default; ignore if not present
  };

  // Insert into Supabase REST
  // Endpoint: /rest/v1/reservas
  const url = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/reservas";
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": serviceKey,
        "authorization": `Bearer ${serviceKey}`,
        "prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });

    const txt = await resp.text();
    if (!resp.ok) {
      // Supabase returns JSON errors, but keep as text fallback
      return json(res, 400, { error: "Supabase insert error", details: txt });
    }

    let out;
    try { out = JSON.parse(txt); } catch { out = txt; }
    return json(res, 200, { ok: true, ref, inserted: out });
  } catch (e) {
    return json(res, 500, { error: "Error conectando a Supabase", details: String(e?.message || e) });
  }
};
