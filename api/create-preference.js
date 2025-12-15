// Vercel Serverless Function: /api/create-preference
// Requiere variables de entorno:
// - MP_ACCESS_TOKEN (obligatoria)
// Opcional:
// - PUBLIC_SITE_URL (si querés forzar la URL pública en back_urls/notification_url)

function money(n){ return Math.round(Number(n)||0); }

function parseDate(v){
  if(!v) return null;
  const [y,m,d] = v.split('-').map(Number);
  if(!y||!m||!d) return null;
  return new Date(Date.UTC(y, m-1, d));
}
function diffNights(ci, co){
  if(!ci || !co) return 0;
  const ms = co.getTime() - ci.getTime();
  return Math.round(ms / (1000*60*60*24));
}

function calcTotal(personas, noches){
  const SENIA = 25000;
  const BASE_NOCHE = 150000;
  const EXTRA_PAX = 25000;

  const p = Number(personas||0);
  const n = Number(noches||0);
  if(p<=0 || n<=0) return { total: 0, senia: SENIA, saldo: 0, porNoche: 0 };

  const porNoche = BASE_NOCHE + Math.max(0, p - 6) * EXTRA_PAX;
  const total = porNoche * n;
  const saldo = Math.max(0, total - SENIA);
  return { total, senia: SENIA, saldo, porNoche };
}

function getBaseUrl(req){
  const forced = process.env.PUBLIC_SITE_URL;
  if(forced) return forced.replace(/\/$/,'');
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
  return `${proto}://${host}`.replace(/\/$/,'');
}

module.exports = async (req, res) => {
  if(req.method === 'OPTIONS'){
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const token = process.env.MP_ACCESS_TOKEN;
  if(!token) return res.status(500).json({ error: 'Falta MP_ACCESS_TOKEN en variables de entorno.' });

  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { checkin, checkout, personas, nombre, email, tel } = body;

    if(!checkin || !checkout || !personas || !nombre || !email){
      return res.status(400).json({ error: 'Faltan datos (fechas, personas, nombre, email).' });
    }

    const ci = parseDate(checkin);
    const co = parseDate(checkout);
    const noches = diffNights(ci, co);
    if(noches < 1) return res.status(400).json({ error: 'La estadía mínima es 1 noche (revisá ingreso/egreso).' });

    const pricing = calcTotal(personas, noches);
    const baseUrl = getBaseUrl(req);
    const ref = `AGUARA-${Date.now()}-${Math.random().toString(16).slice(2,8).toUpperCase()}`;

    const preference = {
      items: [{
        title: `Seña Aguara Lodge (reserva ${noches} noche${noches>1?'s':''})`,
        quantity: 1,
        unit_price: money(pricing.senia),
        currency_id: 'ARS'
      }],
      payer: { name: String(nombre).slice(0,60), email: String(email).slice(0,120) },
      back_urls: {
        success: `${baseUrl}/reserva-ok.html?ref=${encodeURIComponent(ref)}`,
        pending: `${baseUrl}/reserva-pendiente.html?ref=${encodeURIComponent(ref)}`,
        failure: `${baseUrl}/reserva-fallo.html?ref=${encodeURIComponent(ref)}`
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/webhook-mercadopago`,
      external_reference: ref,
      metadata: {
        ref,
        checkin,
        checkout,
        noches,
        personas: Number(personas),
        nombre,
        email,
        tel: tel || '',
        total: money(pricing.total),
        saldo: money(pricing.saldo),
        por_noche: money(pricing.porNoche)
      }
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    });

    const data = await mpRes.json();
    if(!mpRes.ok){
      console.error('MP preference error', data);
      return res.status(502).json({ error: 'Mercado Pago rechazó la preferencia.', detail: data });
    }

    return res.status(200).json({
      init_point: data.init_point,
      id: data.id,
      ref,
      senia: pricing.senia
    });

  }catch(err){
    console.error(err);
    return res.status(500).json({ error: 'Error interno', detail: err?.message });
  }
};
