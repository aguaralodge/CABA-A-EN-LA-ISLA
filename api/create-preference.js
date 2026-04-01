// Vercel Serverless Function: POST /api/create-preference
// Env vars required:
// - MP_ACCESS_TOKEN
// Optional:
// - PUBLIC_SITE_URL (e.g., https://aguaralodge.com)

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function siteUrl(req) {
  const env = process.env.PUBLIC_SITE_URL;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

function makeRef() {
  const r = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `WEB-${Date.now()}-${r}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json(res, 500, { error: "MP_ACCESS_TOKEN no configurado en Vercel" });

  let body = "";
  for await (const chunk of req) body += chunk;

  let data;
  try {
    data = JSON.parse(body || "{}");
  } catch {
    return json(res, 400, { error: "JSON inválido" });
  }

  const ref = makeRef();
  const base = siteUrl(req);
  const senia = Math.max(1, Number(data?.senia || 25000));

  const preference = {
    items: [
      {
        title: "Seña de reserva - Aguara Lodge",
        quantity: 1,
        unit_price: senia,
        currency_id: "ARS"
      }
    ],
    external_reference: ref,
    payer: data?.email ? { email: String(data.email) } : undefined,
    metadata: {
      ref,
      nombre: data?.nombre || "",
      email: data?.email || "",
      tel: data?.tel || "",
      notas: data?.notas || "",
      personas: data?.personas || null,
      checkin: data?.checkin || "",
      checkout: data?.checkout || "",
      noches: data?.noches || null,
      total: data?.total || null,
      senia
    },
    back_urls: {
      success: `${base}/reserva-ok.html?ref=${encodeURIComponent(ref)}`,
      pending: `${base}/reserva-pendiente.html?ref=${encodeURIComponent(ref)}`,
      failure: `${base}/reserva-fallo.html?ref=${encodeURIComponent(ref)}`
    },
    auto_return: "approved",
    notification_url: `${base}/api/webhook-mercadopago`,
    statement_descriptor: "AGUARA LODGE"
  };

  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": ref
      },
      body: JSON.stringify(preference)
    });

    const j = await r.json();
    if (!r.ok) return json(res, 400, { error: j?.message || "Error Mercado Pago", details: j });

    return json(res, 200, {
      init_point: j.init_point,
      sandbox_init_point: j.sandbox_init_point,
      ref
    });
  } catch (e) {
    return json(res, 500, { error: "Error conectando con Mercado Pago", details: String(e?.message || e) });
  }
};
