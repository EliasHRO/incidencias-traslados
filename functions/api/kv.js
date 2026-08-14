// functions/api/kv.js
//
// Cloudflare Pages Function.
// Queda disponible automáticamente en: https://TU-SITIO.pages.dev/api/kv
//
// Requiere un KV Namespace vinculado a este proyecto con el nombre de
// variable "INCIDENCIAS_KV" (se configura en:
// Cloudflare Pages → tu proyecto → Settings → Functions → KV namespace bindings)
//
// Endpoints:
//   GET  /api/kv?key=NOMBRE_DE_LLAVE        -> { value: "..." } o { value: null }
//   POST /api/kv   body: { key, value }     -> { ok: true }
//
// El "value" siempre es un string (normalmente JSON.stringify de lo que
// el dashboard quiera guardar). Este endpoint no interpreta el contenido,
// solo lo guarda y lo devuelve tal cual.

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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.INCIDENCIAS_KV) {
    return jsonResponse({ error: "Falta vincular el KV namespace INCIDENCIAS_KV en Cloudflare Pages." }, 500);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) {
    return jsonResponse({ error: "Falta el parámetro 'key'." }, 400);
  }

  try {
    const value = await env.INCIDENCIAS_KV.get(key);
    return jsonResponse({ value });
  } catch (err) {
    return jsonResponse({ error: "Error leyendo de KV", detail: String(err) }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.INCIDENCIAS_KV) {
    return jsonResponse({ error: "Falta vincular el KV namespace INCIDENCIAS_KV en Cloudflare Pages." }, 500);
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
