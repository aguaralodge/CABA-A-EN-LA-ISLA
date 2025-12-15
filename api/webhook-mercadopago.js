// Vercel Serverless Function: POST /api/webhook-mercadopago
// Env vars required:
// - MP_ACCESS_TOKEN
// Optional for saving approved reservations:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

function ok(res){ res.statusCode = 200; res.end("ok"); }

async function supabaseUpsert(row){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return;

  const endpoint = url.replace(/\/+$/,'') + "/rest/v1/reservas?on_conflict=ref";
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type":"application/json",
      "apikey": key,
      "authorization": `Bearer ${key}`,
      "prefer": "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([row])
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return ok(res);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return ok(res);

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let n;
    try { n = JSON.parse(body || "{}"); } catch { return ok(res); }

    const paymentId = n?.data?.id || n?.id || (typeof n?.resource === "string" ? n.resource.split("/").pop() : null);
    if(!paymentId) return ok(res);

    try{
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const p = await r.json();
      if(!r.ok) return ok(res);

      const status = p.status;
      const meta = p.metadata || {};
      const ref = p.external_reference || meta.ref || `PAY-${paymentId}`;

      if(status === "approved"){
        const checkin = meta.checkin || null;
        const checkout = meta.checkout || null;
        const personas = meta.personas ? parseInt(meta.personas,10) : null;
        const noches = meta.noches ? parseInt(meta.noches,10) : null;
        const notas = (meta.notas || '').toString();
        const total = meta.total ? parseInt(meta.total,10) : null;
        const senia = meta.senia ? parseInt(meta.senia,10) : 25000;
        const saldo = (total!=null) ? Math.max(0, total - senia) : null;

        await supabaseUpsert({
          ref,
          checkin,
          checkout,
          noches,
          personas,
          nombre: meta.nombre || "",
          email: meta.email || "",
          tel: meta.tel || "",
          notas: notas || "",
          total,
          senia,
          saldo,
          payment_id: String(paymentId),
          status: "approved"
        });
      }else{
        await supabaseUpsert({
          ref,
          payment_id: String(paymentId),
          status: status || "unknown"
        });
      }
    }catch(e){
      // ignore
    }
    return ok(res);
  });
};
