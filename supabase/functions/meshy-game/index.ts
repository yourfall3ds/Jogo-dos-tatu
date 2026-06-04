import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────
//  meshy-game — proxy GENÉRICO de passagem pra API do Meshy.
//
//  O jogo (MeshyClient) manda { method, path, body } e esta função repassa
//  pra https://api.meshy.ai<path> injetando a Authorization com a chave
//  guardada no secret MESHY_API_KEY (NUNCA vai pro browser).
//
//  Substitui o config-server local (127.0.0.1:3099) em produção, cobrindo
//  TODO o pipeline: text-to-image, image-to-3d, remesh, retexture, rigging,
//  animations, etc. — sem precisar adaptar o cliente.
//
//  verify_jwt=true → só usuário logado chama (evita abuso da chave).
// ─────────────────────────────────────────────────────────────────

const MESHY_BASE = "https://api.meshy.ai";
const API_KEY = Deno.env.get("MESHY_API_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!API_KEY) return jsonResp({ error: "MESHY_API_KEY não configurada no projeto." }, 500);

  let payload: { method?: string; path?: string; body?: unknown };
  try {
    payload = await req.json();
  } catch (_) {
    return jsonResp({ error: "body JSON inválido" }, 400);
  }

  const method = String(payload.method || "GET").toUpperCase();
  const path = String(payload.path || "");
  // Segurança: só permite caminhos da API openapi do Meshy.
  if (!/^\/openapi\/v1\//.test(path)) {
    return jsonResp({ error: `path inválido: ${path}` }, 400);
  }
  if (method !== "GET" && method !== "POST") {
    return jsonResp({ error: `método não permitido: ${method}` }, 405);
  }

  try {
    const res = await fetch(`${MESHY_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(payload.body ?? {}),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
