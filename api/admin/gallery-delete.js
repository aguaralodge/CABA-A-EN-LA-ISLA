const {
  json,
  requireAdmin,
  readJsonBody,
  getGalleryItemById,
  deleteGalleryItem,
  deleteImageObject,
} = require('../_lib/gallery');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    requireAdmin(req);
    const data = await readJsonBody(req);
    const id = String(data.id || '').trim();
    if (!id) return json(res, 400, { error: 'Falta id' });

    const current = await getGalleryItemById(id);
    if (!current) return json(res, 404, { error: 'Foto no encontrada' });

    await deleteGalleryItem(id);
    if (current.object_path) {
      try { await deleteImageObject(current.object_path); } catch (e) {}
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, e?.statusCode || 500, { error: String(e?.message || e) });
  }
};
