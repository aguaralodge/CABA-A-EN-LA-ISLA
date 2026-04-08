const {
  json,
  requireAdmin,
  readJsonBody,
  safeText,
  uploadImageFromBase64,
  deleteImageObject,
  getGalleryItemById,
  updateGalleryItem,
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

    const patch = {
      titulo: safeText(data.titulo, 120),
      descripcion: safeText(data.descripcion, 500),
      activa: data.activa !== false,
      orden: Number.isFinite(Number(data.orden)) ? Number(data.orden) : null,
    };

    if (data.dataBase64) {
      const uploaded = await uploadImageFromBase64({
        filename: data.filename,
        mimeType: data.mimeType,
        dataBase64: data.dataBase64,
        title: patch.titulo || current.titulo || data.filename || 'foto',
      });
      patch.image_url = uploaded.imageUrl;
      patch.object_path = uploaded.objectPath;
    }

    const row = await updateGalleryItem(id, patch);

    if (patch.object_path && current.object_path && current.object_path !== patch.object_path) {
      try { await deleteImageObject(current.object_path); } catch (e) {}
    }

    return json(res, 200, { ok: true, row });
  } catch (e) {
    return json(res, e?.statusCode || 500, { error: String(e?.message || e) });
  }
};
