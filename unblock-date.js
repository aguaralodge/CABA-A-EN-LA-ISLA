// Vercel Serverless Function: GET /api/blocked-dates
// Returns reserved/blocked date ranges from Supabase without exposing keys to the browser.
// Env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    // If Supabase isn't configured yet, just return empty so the site still works
    return json(res, 200, { ranges: [] });
  }

  try {
    const endpoint =
      supabaseUrl.replace(/\/+$/, "") +
      "/rest/v1/reservas?select=checkin,checkout,status&status=in.(approved,blocked,cash_pending)&checkin=not.is.null&checkout=not.is.null&order=checkin.asc";

    const r = await fetch(endpoint, {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
    });

    const rows = await r.json();
    if (!r.ok) return json(res, 200, { ranges: [] });

    const ranges = (Array.isArray(rows) ? rows : []).map((x) => ({
      checkin: x.checkin,
      checkout: x.checkout,
      status: x.status || "unknown",
    }));

    return json(res, 200, { ranges });
  } catch (e) {
    return json(res, 200, { ranges: [] });
  }
};
