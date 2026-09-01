// worker.js
// Cloudflare Worker con activos estáticos.
// Sirve el dashboard (index.html y demás archivos del repo) y expone
// la API /api/kv para leer/guardar datos en el KV compartido.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function handleKvGet(request, env) {
  if (!env.INCIDENCIAS_KV) {
    return jsonResponse({ error: "Falta el binding INCIDENCIAS_KV." }, 500);
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return jsonResponse({ error: "Falta el parametro 'key'." }, 400);
  try {
    const value = await env.INCIDENCIAS_KV.get(key);
    return jsonResponse({ value });
  } catch (err) {
    return jsonResponse({ error: "Error leyendo de KV", detail: String(err) }, 500);
  }
}

async function handleKvPost(request, env) {
  if (!env.INCIDENCIAS_KV) {
    return jsonResponse({ error: "Falta el binding INCIDENCIAS_KV." }, 500);
  }
  try {
    const data = await request.json();
    const { key, value } = data;
    if (!key || typeof value !== "string") {
      return jsonResponse({ error: "Se requiere 'key' y 'value' (string)." }, 400);
    }
    await env.INCIDENCIAS_KV.put(key, value);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: "Error guardando en KV", detail: String(err) }, 500);
  }
}

// Envía el reporte por correo con el PDF adjunto, usando la API de Resend.
// Requiere el secret RESEND_API_KEY configurado en el Worker.
// Opcionalmente, la variable EMAIL_FROM define el remitente (por defecto usa
// el dominio de pruebas de Resend, que solo entrega a tu propio correo hasta
// que verifiques tu dominio real).
async function handleSendEmail(request, env) {
  if (!env.RESEND_API_KEY) {
    return jsonResponse(
      { error: "Falta configurar RESEND_API_KEY en el Worker (wrangler secret put RESEND_API_KEY)." },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "JSON inválido en el cuerpo de la solicitud" }, 400);
  }

  const { to, cc, subject, text, pdfBase64, filename } = body || {};

  if (!Array.isArray(to) || to.length === 0) {
    return jsonResponse({ error: "Se requiere al menos un destinatario en 'to'." }, 400);
  }
  if (!subject || !pdfBase64 || !filename) {
    return jsonResponse({ error: "Faltan 'subject', 'pdfBase64' o 'filename'." }, 400);
  }

  const fromAddress = env.EMAIL_FROM || "Incidencias VIDRI <onboarding@resend.dev>";

  const payload = {
    from: fromAddress,
    to,
    subject,
    text: text || "",
    attachments: [
      {
        filename,
        content: pdfBase64,
      },
    ],
  };
  if (Array.isArray(cc) && cc.length) payload.cc = cc;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      return jsonResponse(
        { error: resendData.message || "Resend rechazó el envío", detail: resendData },
        resendRes.status
      );
    }

    return jsonResponse({ ok: true, id: resendData.id });
  } catch (err) {
    return jsonResponse({ error: "Error contactando a Resend", detail: String(err) }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/kv") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method === "GET") return handleKvGet(request, env);
      if (request.method === "POST") return handleKvPost(request, env);
      return jsonResponse({ error: "Metodo no soportado" }, 405);
    }

    if (url.pathname === "/api/send-email") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method === "POST") return handleSendEmail(request, env);
      return jsonResponse({ error: "Metodo no soportado" }, 405);
    }

    // Cualquier otra ruta: servir los archivos estáticos (index.html, etc.)
    return env.ASSETS.fetch(request);
  },
};
