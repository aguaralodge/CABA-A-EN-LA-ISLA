export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return res.status(500).json({ ok: false, error: "Faltan variables de Supabase" });
    }

    // Ping mínimo: intenta hablar con Supabase
    const resp = await fetch(url + "/rest/v1/", {
      headers: { apikey: key }
    });

    return res.status(200).json({ ok: true, status: resp.status });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Ping falló", details: String(e?.message || e) });
  }
}
