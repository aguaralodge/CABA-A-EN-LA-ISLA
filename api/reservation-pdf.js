const { fetchReservaByRef, generateReservationPdfBuffer } = require('./_lib/reservas');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method not allowed');
  }
  try {
    const url = new URL(req.url, 'http://local');
    const ref = String(url.searchParams.get('ref') || '').trim();
    if (!ref) {
      res.statusCode = 400;
      return res.end('Falta ref');
    }
    const reserva = await fetchReservaByRef(ref);
    if (!reserva) {
      res.statusCode = 404;
      return res.end('Reserva no encontrada');
    }
    const pdf = await generateReservationPdfBuffer(reserva);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="comprobante-${ref}.pdf"`);
    res.end(pdf);
  } catch (e) {
    res.statusCode = 500;
    res.end('No se pudo generar el PDF');
  }
};
