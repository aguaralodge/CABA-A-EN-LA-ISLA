// Vercel Serverless Function: POST /api/webhook-mercadopago

function ok(res) {
  res.statusCode = 200;
  res.end("ok");
}

async function guardarEnSupabase(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan variables de Supabase");
    return;
  }

  const endpoint = url.replace(/\/+$/, "") + "/rest/v1/reservas";

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": key,
      "authorization": `Bearer ${key}`,
      "prefer": "return=representation"
    },
    body: JSON.stringify(row)
  });

  const txt = await r.text();

  if (!r.ok) {
    console.error("ERROR guardando en Supabase:", txt);
  } else {
    console.log("Reserva guardada OK:", row.ref);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return ok(res);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("Falta MP_ACCESS_TOKEN");
    return ok(res);
  }

  let body = "";
  req.on("data", (c) => (body += c));

  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");

      console.log("Webhook recibido:", JSON.stringify(data));

      const paymentId =
        data?.data?.id ||
        data?.id ||
        (typeof data?.resource === "string"
          ? data.resource.split("/").pop()
          : null);

      if (!paymentId) {
        console.error("No hay paymentId");
        return ok(res);
      }

      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const p = await r.json();

      if (!r.ok) {
        console.error("Error consultando pago:", p);
        return ok(res);
      }

      console.log("Pago obtenido:", p.status);

      if (p.status !== "approved") {
        console.log("Pago no aprobado:", p.status);
        return ok(res);
      }

      const meta = p.metadata || {};
      const ref = p.external_reference || meta.ref || `PAY-${paymentId}`;

      await guardarEnSupabase({
        ref,
        checkin: meta.checkin || null,
        checkout: meta.checkout || null,
        noches: meta.noches ? parseInt(meta.noches, 10) : null,
        personas: meta.personas ? parseInt(meta.personas, 10) : null,
        nombre: meta.nombre || "",
        email: meta.email || "",
        tel: meta.tel || "",
        notas: meta.notas || "",
        total: meta.total ? parseInt(meta.total, 10) : null,
        senia: meta.senia ? parseInt(meta.senia, 10) : 25000,
        saldo:
          meta.total && meta.senia
            ? parseInt(meta.total, 10) - parseInt(meta.senia, 10)
            : null,
        payment_id: String(paymentId),
        status: "approved"
      });

      return ok(res);
    } catch (e) {
      console.error("ERROR webhook:", e);
      return ok(res);
    }
  });
};
