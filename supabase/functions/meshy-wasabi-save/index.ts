import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";

// ─────────────────────────────────────────────────────────────────
//  meshy-wasabi-save — ingest SERVER-SIDE de assets gerados pro Wasabi.
//
//  O jogo manda { url, key, contentType }. A função:
//    1. busca os BYTES da `url` (modelo/imagem do Meshy) — server-side, sem CORS
//    2. sobe no bucket Wasabi sob `key` (S3 PutObject)
//    3. devolve { key, publicUrl }
//
//  Leitura: o prefixo PUBLIC_PREFIX deve ter policy de leitura PÚBLICA no
//  Wasabi → a publicUrl funciona direto (sem assinar). Assim o GLB/imagem
//  carrega em qualquer player do mundo compartilhado.
//
//  Segurança:
//    • verify_jwt=true (só logado).
//    • `key` é forçada dentro de PUBLIC_PREFIX (não sobrescreve arquivos do site).
//    • `url` só pode ser de hosts do Meshy (anti-SSRF).
// ─────────────────────────────────────────────────────────────────

const region = Deno.env.get("WASABI_REGION") || Deno.env.get("VITE_WASABI_REGION") || "us-east-2";
const endpoint = (Deno.env.get("WASABI_ENDPOINT") || Deno.env.get("VITE_WASABI_ENDPOINT") || `https://s3.${region}.wasabisys.com`).replace(/\/$/, "");
const bucket = Deno.env.get("WASABI_BUCKET") || Deno.env.get("VITE_WASABI_BUCKET") || Deno.env.get("WASABI_BUCKET_NAME") || Deno.env.get("VITE_WASABI_BUCKET_NAME") || "";
const accessKeyId = Deno.env.get("WASABI_ACCESS_KEY_ID") || Deno.env.get("VITE_WASABI_ACCESS_KEY_ID") || "";
const secretAccessKey = Deno.env.get("WASABI_SECRET_ACCESS_KEY") || Deno.env.get("VITE_WASABI_SECRET_ACCESS_KEY") || "";

// Prefixo PÚBLICO (configurar policy de leitura pública no Wasabi p/ este prefixo).
const PUBLIC_PREFIX = "game-assets/";
// Hosts permitidos como FONTE (anti-SSRF). Meshy serve imagem/modelo aqui.
const ALLOWED_HOST = /(^|\.)meshy\.ai$/i;

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

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return jsonResp({ error: "Configuração do Wasabi incompleta no projeto." }, 500);
  }

  let payload: { url?: string; key?: string; contentType?: string };
  try {
    payload = await req.json();
  } catch (_) {
    return jsonResp({ error: "body JSON inválido" }, 400);
  }

  const url = String(payload.url || "");
  let key = String(payload.key || "");
  if (!url || !key) return jsonResp({ error: "url e key são obrigatórios" }, 400);

  // key SEMPRE dentro do prefixo público; sem traversal.
  if (!key.startsWith(PUBLIC_PREFIX)) key = PUBLIC_PREFIX + key.replace(/^\/+/, "");
  if (key.includes("..")) return jsonResp({ error: "key inválida" }, 400);

  // url só de hosts do Meshy (anti-SSRF).
  let host = "";
  try { host = new URL(url).host; } catch (_) { return jsonResp({ error: "url inválida" }, 400); }
  if (!ALLOWED_HOST.test(host)) {
    return jsonResp({ error: `host não permitido: ${host}` }, 400);
  }

  try {
    const r = await fetch(url);
    if (!r.ok) return jsonResp({ error: `fetch da fonte falhou: ${r.status}` }, 502);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const ct = payload.contentType || r.headers.get("content-type") || "application/octet-stream";

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: ct,
    }));

    const publicUrl = `${endpoint}/${bucket}/${key}`;
    return jsonResp({ ok: true, key, publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
