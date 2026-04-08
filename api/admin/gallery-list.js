const { json, requireAdmin, listGallery, fallbackGallery } = require('../_lib/gallery');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    requireAdmin(req);
    const rows = await listGallery({ includeInactive: true });
    return json(res, 200, { rows });
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status === 401) return json(res, status, { error: e.message });
    return json(res, 200, { rows: fallbackGallery(), fallback: true, details: String(e?.message || e) });
  }
};
