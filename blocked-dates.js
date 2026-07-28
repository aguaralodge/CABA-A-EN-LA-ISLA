export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Esto sirve para detectar si Vercel realmente tiene las variables
    if (!url || !key) {
      return res.status(500).json({
        ok: false,
        error: "Faltan variables en Vercel",
        supabase_url: !!url,
        service_role_key: !!key
      });
    }

    // Ping a Supabase (con headers correctos)
    const resp = await fetch(url + "/rest/v1/", {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key
      }
    });

    // Si llegó hasta acá, conectó
    return res.status(200).json({
      ok: true,
      status: resp.status
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "Ping falló",
      details: String(e?.message || e)
    });
  }
}
