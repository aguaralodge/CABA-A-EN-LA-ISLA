const { upsertReserva, sendOwnerWhatsAppText } = require('./_lib/reservas');

function ok(res) {
  res.statusCode = 200;
  res.end('ok');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return ok(res);

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('Falta MP_ACCESS_TOKEN');
    return ok(res);
  }

  let body = '';
  req.on('data', (c) => (body += c));

  req.on('end', async () => {
    try {
      const data = JSON.parse(body || '{}');
      const paymentId =
        data?.data?.id ||
        data?.id ||
        (typeof data?.resource === 'string' ? data.resource.split('/').pop() : null);

      if (!paymentId) {
        console.error('No hay paymentId');
        return ok(res);
      }

      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const p = await r.json();
      if (!r.ok) {
        console.error('Error consultando pago:', p);
        return ok(res);
      }
      if (p.status !== 'approved') return ok(res);

      const meta = p.metadata || {};
      const ref = p.external_reference || meta.ref || `PAY-${paymentId}`;
      const total = meta.total ? parseInt(meta.total, 10) : null;
      const senia = meta.senia ? parseInt(meta.senia, 10) : 25000;

      const reserva = await upsertReserva({
        ref,
        checkin: meta.checkin || null,
        checkout: meta.checkout || null,
        noches: meta.noches ? parseInt(meta.noches, 10) : null,
        personas: meta.personas ? parseInt(meta.personas, 10) : null,
        nombre: meta.nombre || '',
        email: meta.email || '',
        tel: meta.tel || '',
        total,
        senia,
        saldo: total != null ? Math.max(0, total - senia) : null,
        payment_id: String(paymentId),
        status: 'approved',
      });

      try {
        await sendOwnerWhatsAppText({ reserva, req });
      } catch (e) {
        console.error('No se pudo enviar WhatsApp:', String(e?.message || e));
      }

      return ok(res);
    } catch (e) {
      console.error('ERROR webhook:', e);
      return ok(res);
    }
  });
};
