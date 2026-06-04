import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// ─────────────────────────────────────────────────────────────────
//  wasabi-sign — endpoint ESTÁVEL de leitura dos assets do jogo no Wasabi.
//
//  GET ?key=game-assets/<arquivo> → assina uma URL GET (12h) e REDIRECIONA
//  (302) pro Wasabi. Assim o banco guarda uma URL fixa (este endpoint) que
//  nunca expira, e a assinatura é gerada fresca a cada carregamento.
//
//  Público (verify_jwt=false) de propósito: só assina o prefixo game-assets/
//  (assets do jogo, conteúdo público-intent). NUNCA toca em outros prefixos.
//
//  Bucket dedicado do jogo via GAME_WASABI_BUCKET (cai pro WASABI_BUCKET).
// ─────────────────────────────────────────────────────────────────

const region = Deno.env.get("GAME_WASABI_REGION") || Deno.env.get("WASABI_REGION") || "us-east-2";
const endpoint = (Deno.env.get("GAME_WASABI_ENDPOINT") || Deno.env.get("WASABI_ENDPOINT") || `https://s3.${region}.wasabisys.com`).replace(/\/$/, "");
const bucket = Deno.env.get("GAME_WASABI_BUCKET") || Deno.env.get("WASABI_BUCKET") || Deno.env.get("VITE_WASABI_BUCKET") || "";
const accessKeyId = Deno.env.get("WASABI_ACCESS_KEY_ID") || Deno.env.get("VITE_WASABI_ACCESS_KEY_ID") || "";
const secretAccessKey = Deno.env.get("WASABI_SECRET_ACCESS_KEY") || Deno.env.get("VITE_WASABI_SECRET_ACCESS_KEY") || "";

const PUBLIC_PREFIX = "game-assets/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return new Response(JSON.stringify({ error: "Configuração do Wasabi incompleta." }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!key.startsWith(PUBLIC_PREFIX) || key.includes("..")) {
    return new Response(JSON.stringify({ error: "key inválida (só game-assets/)" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const signed = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 43200 }, // 12h
    );
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: signed, "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
