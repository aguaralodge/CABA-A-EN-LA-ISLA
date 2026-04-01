// Vercel Serverless Function: GET /api/reservation-by-ref?ref=WEB-...

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const ref = String(req.query?.ref || "").trim();
  if (!ref) return json(res, 400, { error: "Falta ref" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: "Supabase no configurado" });

  try {
    const endpoint =
      supabaseUrl.replace(/\/+$/, "") +
      "/rest/v1/reservas?select=ref,checkin,checkout,noches,personas,nombre,email,tel,total,senia,saldo,status,payment_id,created_at&ref=eq." + encodeURIComponent(ref) + "&limit=1";

    const r = await fetch(endpoint, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json"
      }
    });

    const rows = await r.json().catch(() => []);
    if (!r.ok) return json(res, 500, { error: "No se pudo consultar Supabase", details: rows });

    return json(res, 200, { reservation: Array.isArray(rows) ? (rows[0] || null) : null });
  } catch (e) {
    return json(res, 500, { error: "Error consultando la reserva", details: String(e?.message || e) });
  }
};
