const { json, listGallery, fallbackGallery } = require('./_lib/gallery');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const rows = await listGallery({ includeInactive: false });
    return json(res, 200, { rows });
  } catch (e) {
    return json(res, 200, { rows: fallbackGallery(), fallback: true, details: String(e?.message || e) });
  }
};
