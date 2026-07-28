const PRICING = {
  precioBaseNoche: 180000,
  personasIncluidas: 6,
  precioExtraPorPersona: 30000,
  senia: 30000,
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calculateReservationTotal(personas, noches) {
  const p = Math.max(1, parseInt(personas || 1, 10));
  const n = Math.max(0, parseInt(noches || 0, 10));
  const extra = Math.max(0, p - PRICING.personasIncluidas) * PRICING.precioExtraPorPersona;
  return (PRICING.precioBaseNoche + extra) * n;
}

function normalizeSenia(value) {
  const senia = toNumber(value, PRICING.senia);
  return senia > 0 ? senia : PRICING.senia;
}

module.exports = {
  PRICING,
  calculateReservationTotal,
  normalizeSenia,
};
