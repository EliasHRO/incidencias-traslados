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

    // Cualquier otra ruta: servir los archivos estáticos (index.html, etc.)
    return env.ASSETS.fetch(request);
  },
};
