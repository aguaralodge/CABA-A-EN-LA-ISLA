// Vercel Serverless Function: /api/webhook-mercadopago
// Recibe notificaciones de Mercado Pago y (opcionalmente) guarda la reserva.
//
// Variables opcionales para guardar en Supabase:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Tabla sugerida: reservas
// columnas: ref (text, pk), checkin (date), checkout (date), noches (int), personas (int),
// nombre (text), email (text), tel (text), total (int), senia (int), saldo (int),
// payment_id (bigint/text), status (text), created_at (timestamp)

async function supabaseUpsert(reserva){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return { skipped:true };

  const r = await fetch(`${url.replace(/\/$/,'')}/rest/v1/reservas?on_conflict=ref`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([reserva])
  });
  const txt = await r.text();
  if(!r.ok) throw new Error(`Supabase error: ${r.status} ${txt}`);
  return { ok:true };
}

module.exports = async (req, res) => {
  // Mercado Pago puede enviar POST con query params y/o body
  try{
    const token = process.env.MP_ACCESS_TOKEN;
    if(!token) return res.status(500).send('Missing MP_ACCESS_TOKEN');

    const q = req.query || {};
    const body = typeof req.body === 'string' ? (()=>{ try{return JSON.parse(req.body)}catch{return {}} })() : (req.body||{});

    // En muchos casos llega: ?type=payment&data.id=123...
    const type = q.type || body.type;
    const dataId = (q['data.id'] || (body.data && body.data.id) || body['data.id'] || q.id || body.id);
    if(!dataId){
      // Respondemos 200 para que MP no reintente infinito
      return res.status(200).json({ ok:true, note:'No data.id' });
    }

    // Consultar el pago
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const payment = await payRes.json();
    if(!payRes.ok){
      console.error('MP payment fetch error', payment);
      return res.status(200).json({ ok:false, note:'payment fetch failed' });
    }

    const status = payment.status; // approved, pending, rejected...
    const ref = payment.external_reference || (payment.metadata && payment.metadata.ref) || null;
    const md = payment.metadata || {};

    // Solo confirmamos "reserva" si el pago está aprobado
    if(status === 'approved' && ref){
      const reserva = {
        ref,
        checkin: md.checkin || null,
        checkout: md.checkout || null,
        noches: md.noches || null,
        personas: md.personas || null,
        nombre: md.nombre || null,
        email: md.email || null,
        tel: md.tel || null,
        total: md.total || null,
        senia: 25000,
        saldo: md.saldo || null,
        payment_id: String(payment.id),
        status: status,
        created_at: new Date().toISOString()
      };

      try{
        await supabaseUpsert(reserva);
      }catch(e){
        console.error('Supabase save failed', e?.message);
      }
    }

    return res.status(200).json({ ok:true });

  }catch(err){
    console.error('webhook error', err);
    return res.status(200).json({ ok:false });
  }
};
