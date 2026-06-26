#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =====================================================================
#  run-local.py — sobe o TransFPS em localhost (1 comando, Python puro)
#
#  O que faz:
#    1. Sobe o config-server real (node tools/config-server.js) na :3099
#       -> /transfps-env, /db/*, /meshy/*, /proxy-image, /save-thumb...
#    2. Serve os arquivos estaticos do jogo na :5500 (index.html + src + assets)
#       com MIME correto p/ ES modules (.js/.mjs), GLB, WASM, JSON e CSS.
#    3. Abre o navegador em http://localhost:5500
#
#  Babylon.js, os loaders e o Havok (WASM) vem da CDN -> nao ha COOP/COEP
#  (ativar isolamento cross-origin BLOQUEARIA a CDN). Assets GLB sao locais
#  (pastas com espacos sao tratadas: o handler ja faz unquote do path).
#
#  Uso:
#    python tools/run-local.py            # portas padrao 5500 / 3099
#    python tools/run-local.py --port 8080 --no-browser
# =====================================================================
import argparse
import functools
import http.server
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser

# Forca stdout/stderr em UTF-8 (config-server emite emoji; cp1252 do Windows quebra).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# MIME explicito (no Windows o mimetypes le o registro e devolve lixo p/ .js).
MIME = {
    ".js":   "text/javascript; charset=utf-8",
    ".mjs":  "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".wasm": "application/wasm",
    ".glb":  "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".svg":  "image/svg+xml",
    ".m4a":  "audio/mp4",
    ".mp3":  "audio/mpeg",
    ".ogg":  "audio/ogg",
    ".wav":  "audio/wav",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


class GameHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler com MIME correto, no-cache (dev) e CORS liberado."""

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME:
            return MIME[ext]
        return super().guess_type(path)

    def end_headers(self):
        # Dev: nunca cachear codigo/HTML -> F5 sempre pega a versao nova.
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else "?"
        # So loga erros (4xx/5xx) p/ nao poluir com cada GLB/asset.
        if str(code).startswith(("4", "5")):
            sys.stderr.write("  [5500] %s -> %s\n" % (self.path[:90], code))


def free_port(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def start_config_server():
    """Sobe o config-server real (node). Devolve o Popen ou None."""
    node = shutil.which("node")
    if not node:
        print("  [3099] !! node nao encontrado no PATH — config-server NAO subiu.")
        print("         Login/Meshy/proxy-image ficam offline (o jogo abre mesmo assim).")
        return None
    if not free_port(3099):
        print("  [3099] ja em uso — assumindo config-server ja rodando.")
        return None
    script = os.path.join(ROOT, "tools", "config-server.js")
    proc = subprocess.Popen(
        [node, script],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    def pump():
        for line in proc.stdout:
            try:
                sys.stdout.write("  [3099] " + line)
                sys.stdout.flush()
            except Exception:
                pass

    threading.Thread(target=pump, daemon=True).start()
    return proc


def main():
    ap = argparse.ArgumentParser(description="Sobe o TransFPS em localhost.")
    ap.add_argument("--port", type=int, default=5500, help="porta do jogo (default 5500)")
    ap.add_argument("--no-browser", action="store_true", help="nao abrir o navegador")
    args = ap.parse_args()

    os.chdir(ROOT)
    print("=" * 60)
    print("  TransFPS — localhost")
    print("  raiz:", ROOT)
    print("=" * 60)

    cfg = start_config_server()

    if not free_port(args.port):
        print("  [%d] PORTA OCUPADA — feche o outro servidor ou use --port." % args.port)
        if cfg:
            cfg.terminate()
        sys.exit(1)

    handler = functools.partial(GameHandler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)

    url = "http://localhost:%d/" % args.port
    print("  [%d] jogo servindo em %s" % (args.port, url))
    print("  Ctrl+C p/ parar tudo.\n")

    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  parando servidores...")
    finally:
        httpd.shutdown()
        if cfg:
            cfg.terminate()


if __name__ == "__main__":
    main()
