const {
  json,
  requireAdmin,
  readJsonBody,
  safeText,
  uploadImageFromBase64,
  insertGalleryItem,
} = require('../_lib/gallery');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    requireAdmin(req);
    const data = await readJsonBody(req);
    const titulo = safeText(data.titulo, 120);
    const descripcion = safeText(data.descripcion, 500);
    const orden = Number.isFinite(Number(data.orden)) ? Number(data.orden) : null;
    const activa = data.activa !== false;

    const uploaded = await uploadImageFromBase64({
      filename: data.filename,
      mimeType: data.mimeType,
      dataBase64: data.dataBase64,
      title: titulo || data.filename || 'foto',
    });

    const row = await insertGalleryItem({
      titulo,
      descripcion,
      orden,
      activa,
      image_url: uploaded.imageUrl,
      object_path: uploaded.objectPath,
    });

    return json(res, 200, { ok: true, row });
  } catch (e) {
    return json(res, e?.statusCode || 500, { error: String(e?.message || e) });
  }
};
