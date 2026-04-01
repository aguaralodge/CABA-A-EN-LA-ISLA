// Vercel Serverless Function: /api/webhook-mercadopago
// Mercado Pago puede llamar varias veces al webhook.
// Por eso guardamos con UPSERT usando ref como clave única.

function ok(res) {
  res.statusCode = 200;
  res.end("ok");
}

function getPaymentId(req, data) {
  return (
    data?.data?.id ||
    data?.id ||
    req?.query?.["data.id"] ||
    req?.query?.id ||
    (typeof data?.resource === "string" ? data.resource.split("/").pop() : null)
  );
}

async function upsertReserva(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Faltan variables de Supabase");

  const endpoint = url.replace(/\/+$/, "") + "/rest/v1/reservas?on_conflict=ref";
  const cleanRow = {
    ref: row.ref,
    checkin: row.checkin || null,
    checkout: row.checkout || null,
    noches: Number.isFinite(row.noches) ? row.noches : null,
    personas: Number.isFinite(row.personas) ? row.personas : null,
    nombre: row.nombre || null,
    email: row.email || null,
    tel: row.tel || null,
    total: Number.isFinite(row.total) ? row.total : null,
    senia: Number.isFinite(row.senia) ? row.senia : 25000,
    saldo: Number.isFinite(row.saldo) ? row.saldo : null,
    payment_id: row.payment_id || null,
    status: row.status || "approved"
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(cleanRow)
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`Supabase: ${txt}`);
  return txt;
}

module.exports = async (req, res) => {
  if (!["POST", "GET", "PUT"].includes(req.method)) return ok(res);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta MP_ACCESS_TOKEN");
    return ok(res);
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { data = {}; }

  try {
    const paymentId = getPaymentId(req, data);
    if (!paymentId) {
      console.error("Webhook sin paymentId", { query: req.query, body: data });
      return ok(res);
    }

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const p = await r.json();

    if (!r.ok) {
      console.error("Error consultando pago en Mercado Pago:", p);
      return ok(res);
    }

    if (p.status !== "approved") {
      console.log("Pago todavía no aprobado:", p.status, paymentId);
      return ok(res);
    }

    const meta = p.metadata || {};
    const total = meta.total != null ? parseInt(meta.total, 10) : null;
    const senia = meta.senia != null ? parseInt(meta.senia, 10) : 25000;

    await upsertReserva({
      ref: p.external_reference || meta.ref || `PAY-${paymentId}`,
      checkin: meta.checkin || null,
      checkout: meta.checkout || null,
      noches: meta.noches != null ? parseInt(meta.noches, 10) : null,
      personas: meta.personas != null ? parseInt(meta.personas, 10) : null,
      nombre: meta.nombre || "",
      email: meta.email || p.payer?.email || "",
      tel: meta.tel || "",
      total,
      senia,
      saldo: total != null ? Math.max(0, total - senia) : null,
      payment_id: String(paymentId),
      status: "approved"
    });

    console.log("Reserva aprobada guardada correctamente:", p.external_reference || meta.ref || paymentId);
    return ok(res);
  } catch (e) {
    console.error("ERROR webhook:", e);
    return ok(res);
  }
};
