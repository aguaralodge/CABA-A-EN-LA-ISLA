const { json, fetchReservaByRef } = require('./_lib/reservas');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const url = new URL(req.url, 'http://local');
    const ref = String(url.searchParams.get('ref') || '').trim();
    if (!ref) return json(res, 400, { error: 'Falta ref' });
    const reserva = await fetchReservaByRef(ref);
    if (!reserva) return json(res, 404, { error: 'Reserva no encontrada' });
    return json(res, 200, { reserva });
  } catch (e) {
    return json(res, 500, { error: 'No se pudo consultar la reserva', details: String(e?.message || e) });
  }
};
