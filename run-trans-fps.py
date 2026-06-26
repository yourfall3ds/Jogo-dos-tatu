#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =====================================================================
#  run-trans-fps.py — sobe o TransFPS em localhost COM TÚNEL pra VPS.
#  LOCAL: d:\GAMES\Jogo-dos-tatu\run-trans-fps.py
#
#  Inspirado no run_standalone.py do Montador (túnel SSH + monitor),
#  adaptado pra arquitetura do TransFPS (estático + config-server node).
#
#  O QUE FAZ (1 comando, Ctrl+C derruba tudo):
#    1. TÚNEL SSH  -> ssh -L 2567:127.0.0.1:2567 vps
#         A porta 2567 LOCAL aponta pro Colyseus REAL da VPS
#         (/opt/transfps-colyseus). O front em localhost conecta em
#         ws://localhost:2567 e cai DIRETO no servidor de produção —
#         sem mexer no código, sem nginx, sem Cloudflare.
#    2. CONFIG-SERVER -> node tools/config-server.js (:3099)
#         /transfps-env, /save-thumb, /proxy-image, Meshy, GLB...
#    3. JOGO (estático) -> http.server na :5500 (index.html + src + assets)
#         MIME correto p/ ES modules, GLB, WASM, áudio.
#    4. Abre o navegador em http://localhost:5500
#
#  Uso:
#    python run-trans-fps.py                 # túnel + config + jogo (porta 5500)
#    python run-trans-fps.py --port 8080     # outra porta do jogo
#    python run-trans-fps.py --no-tunnel     # sem túnel (MP offline ou Colyseus local)
#    python run-trans-fps.py --no-browser    # não abre o navegador
#    python run-trans-fps.py --no-config     # não sobe o config-server node
# =====================================================================
from __future__ import annotations

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
from pathlib import Path

# Força stdout/stderr em UTF-8 (config-server emite emoji; cp1252 quebra).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent

# ── Túnel SSH -> Colyseus da VPS ─────────────────────────────────────
SSH_ALIAS = os.getenv("TRANSFPS_SSH_ALIAS", "vps").strip()
CS_LOCAL_PORT = int(os.getenv("TRANSFPS_CS_LOCAL_PORT", "2567"))
CS_REMOTE_HOST = os.getenv("TRANSFPS_CS_REMOTE_HOST", "127.0.0.1").strip()
CS_REMOTE_PORT = int(os.getenv("TRANSFPS_CS_REMOTE_PORT", "2567"))

CONFIG_PORT = 3099
GAME_PORT_DEFAULT = 5500

CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

# MIME explícito (no Windows o mimetypes lê o registro e devolve lixo p/ .js).
MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".svg": "image/svg+xml",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def log(msg: str) -> None:
    print(f"[transfps] {msg}", flush=True)


# =====================================================================
#  Static handler (o jogo)
# =====================================================================

class GameHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler com MIME correto, no-cache (dev) e CORS liberado."""

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME:
            return MIME[ext]
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else "?"
        if str(code).startswith(("4", "5")):
            sys.stderr.write("  [game] %s -> %s\n" % (self.path[:90], code))


# =====================================================================
#  Helpers de porta / socket
# =====================================================================

def free_port(port: int, host: str = "127.0.0.1") -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def wait_for_tcp(host: str, port: int, timeout_s: float) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1.0)
            try:
                sock.connect((host, port))
                return True
            except OSError:
                time.sleep(0.4)
    return False


# =====================================================================
#  Túnel SSH -> Colyseus da VPS
# =====================================================================

def build_tunnel_command() -> list[str]:
    return [
        "ssh",
        "-o", "ExitOnForwardFailure=yes",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-o", "BatchMode=yes",
        "-N",
        "-L", f"127.0.0.1:{CS_LOCAL_PORT}:{CS_REMOTE_HOST}:{CS_REMOTE_PORT}",
        SSH_ALIAS,
    ]


def start_tunnel() -> subprocess.Popen | None:
    """Abre o túnel SSH. Se a 2567 já estiver ocupada, assume que já há túnel/servidor."""
    if not free_port(CS_LOCAL_PORT):
        log(f"porta {CS_LOCAL_PORT} já em uso — assumindo túnel/Colyseus já ativo.")
        return None
    cmd = build_tunnel_command()
    log(f"abrindo túnel: ssh -L {CS_LOCAL_PORT} -> {SSH_ALIAS}:{CS_REMOTE_PORT} (Colyseus da VPS)")
    proc = subprocess.Popen(
        cmd, cwd=str(ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
        creationflags=CREATE_NEW_PROCESS_GROUP,
    )

    def pump():
        for line in proc.stdout:
            sys.stderr.write("  [tunnel] " + line)
            sys.stderr.flush()

    threading.Thread(target=pump, daemon=True).start()

    if not wait_for_tcp("127.0.0.1", CS_LOCAL_PORT, 20):
        log("!! túnel NÃO abriu a porta 2567 em 20s — multiplayer pode ficar offline.")
        log("   (cheque o SSH 'vps': ssh vps whoami)")
    else:
        log(f"túnel OK — ws://localhost:{CS_LOCAL_PORT} -> Colyseus da VPS")
    return proc


# =====================================================================
#  Config-server (node)
# =====================================================================

def start_config_server() -> subprocess.Popen | None:
    node = shutil.which("node")
    if not node:
        log("!! node não encontrado no PATH — config-server NÃO subiu.")
        log("   Login/Meshy/proxy-image ficam offline (o jogo abre mesmo assim).")
        return None
    if not free_port(CONFIG_PORT):
        log(f"porta {CONFIG_PORT} já em uso — assumindo config-server já rodando.")
        return None
    script = ROOT / "tools" / "config-server.js"
    if not script.is_file():
        log(f"!! {script} não existe — config-server pulado.")
        return None
    log(f"subindo config-server (node) na :{CONFIG_PORT}")
    proc = subprocess.Popen(
        [node, str(script)], cwd=str(ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
        creationflags=CREATE_NEW_PROCESS_GROUP,
    )

    def pump():
        for line in proc.stdout:
            sys.stdout.write("  [config] " + line)
            sys.stdout.flush()

    threading.Thread(target=pump, daemon=True).start()
    return proc


# =====================================================================
#  Electron — janela de jogo desktop (pointer lock real, sem cursor de
#  browser, sem atalhos de aba). Usa o launcher pronto em tools/electron-dev.
# =====================================================================

ELECTRON_DIR = ROOT / "tools" / "electron-dev"


def _electron_bin() -> str | None:
    """Acha o binário do Electron (local ao electron-dev)."""
    base = ELECTRON_DIR / "node_modules" / ".bin"
    cand = base / ("electron.cmd" if sys.platform == "win32" else "electron")
    if cand.is_file():
        return str(cand)
    # fallback: electron.cmd direto
    alt = base / "electron"
    return str(alt) if alt.exists() else None


def start_electron(url: str) -> subprocess.Popen | None:
    """Lança a janela do jogo (Electron) apontando pro servidor local.
    Retorna o Popen — quando ESSA janela fecha, o script derruba tudo."""
    main_js = ELECTRON_DIR / "main.js"
    if not main_js.is_file():
        log(f"!! {main_js} não existe — Electron pulado (caindo pro navegador).")
        return None
    bin_ = _electron_bin()
    if not bin_:
        log("!! Electron não instalado em tools/electron-dev/node_modules.")
        log("   Rode:  cd tools/electron-dev && npm install")
        return None
    env = dict(os.environ)
    env["TRANSFPS_URL"] = url           # o main.js do Electron lê isto
    # CRÍTICO: terminais embutidos (Trae/VSCode, que SÃO Electron) injetam
    #  ELECTRON_RUN_AS_NODE=1 e afins no ambiente. Isso faz o nosso electron.exe
    #  rodar como NODE PURO (app=undefined → "Cannot read properties of
    #  undefined (reading 'whenReady')"). Limpamos pra ele virar app de verdade.
    for k in ("ELECTRON_RUN_AS_NODE", "ELECTRON_FORCE_IS_PACKAGED",
              "VSCODE_RUN_IN_ELECTRON", "ICUBE_IS_ELECTRON", "ICUBE_ELECTRON_PATH",
              "ELECTRON_NO_ATTACH_CONSOLE"):
        env.pop(k, None)
    log(f"abrindo o JOGO no Electron (desktop) → {url}")
    proc = subprocess.Popen(
        [bin_, "."], cwd=str(ELECTRON_DIR), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace",
        creationflags=CREATE_NEW_PROCESS_GROUP,
    )

    def pump():
        for line in proc.stdout:
            sys.stdout.write("  [game] " + line)
            sys.stdout.flush()

    threading.Thread(target=pump, daemon=True).start()
    return proc


# =====================================================================
#  Shutdown limpo
# =====================================================================

def stop_process(name: str, proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    log(f"encerrando {name} (PID {proc.pid})")
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                       check=False, capture_output=True, text=True)
    else:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


# =====================================================================
#  Main
# =====================================================================

def main() -> int:
    ap = argparse.ArgumentParser(description="Sobe o TransFPS em localhost com túnel pra VPS.")
    ap.add_argument("--port", type=int, default=GAME_PORT_DEFAULT, help="porta do jogo (default 5500)")
    ap.add_argument("--no-tunnel", action="store_true", help="não abre o túnel SSH pra VPS")
    ap.add_argument("--no-config", action="store_true", help="não sobe o config-server node")
    ap.add_argument("--browser", action="store_true",
                    help="abre no NAVEGADOR em vez do Electron (modo antigo)")
    ap.add_argument("--no-window", action="store_true",
                    help="não abre janela nenhuma (só sobe os servidores)")
    args = ap.parse_args()

    os.chdir(ROOT)
    print("=" * 62)
    print("  TransFPS — localhost + túnel VPS")
    print("  raiz:", ROOT)
    print("=" * 62)

    tunnel = config = electron = None
    httpd = None

    try:
        # 1) Túnel SSH -> Colyseus da VPS
        if not args.no_tunnel:
            tunnel = start_tunnel()
        else:
            log("--no-tunnel: multiplayer usa o Colyseus que estiver na 2567 local (ou offline).")

        # 2) Config-server (node)
        if not args.no_config:
            config = start_config_server()
        else:
            log("--no-config: config-server pulado (login/meshy/proxy offline).")

        # 3) Jogo estático
        if not free_port(args.port):
            log(f"!! porta {args.port} OCUPADA — feche o outro servidor ou use --port.")
            raise SystemExit(1)

        handler = functools.partial(GameHandler, directory=str(ROOT))
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)

        url = f"http://localhost:{args.port}/"

        # serve numa thread pra poder monitorar os filhos no main
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()

        # 4) Abre o JOGO. Padrão = Electron (desktop). --browser = navegador.
        electron = None
        if args.no_window:
            log("--no-window: só os servidores no ar (abra você o cliente).")
        elif args.browser:
            log("--browser: abrindo no navegador (modo antigo).")
            threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        else:
            electron = start_electron(url)
            if electron is None:
                log("caindo pro navegador (Electron indisponível).")
                threading.Timer(1.0, lambda: webbrowser.open(url)).start()

        print()
        log("TUDO VIVO:")
        log(f"  jogo    : {url}")
        if tunnel is not None:
            log(f"  colyseus: ws://localhost:{CS_LOCAL_PORT}  (túnel -> VPS de produção)")
        if config is not None:
            log(f"  config  : http://127.0.0.1:{CONFIG_PORT}/")
        if electron is not None:
            log("  janela do jogo (Electron) aberta — FECHAR a janela encerra tudo.")
        log("  Ctrl+C p/ parar tudo.")
        print()

        while True:
            # Se a JANELA do jogo (Electron) fechou, encerra tudo — é um jogo
            # desktop: fechar o jogo = sair. (no modo browser, electron é None)
            if electron is not None and electron.poll() is not None:
                print()
                log("janela do jogo fechada — encerrando tudo.")
                return 0
            if tunnel is not None and tunnel.poll() is not None:
                log("!! túnel SSH caiu — multiplayer offline. (jogo continua de pé)")
                tunnel = None
            if config is not None and config.poll() is not None:
                log("!! config-server caiu. (jogo continua de pé)")
                config = None
            time.sleep(0.5)

    except KeyboardInterrupt:
        print()
        log("Ctrl+C — encerrando tudo.")
        return 0
    finally:
        if httpd is not None:
            httpd.shutdown()
        try: stop_process("janela do jogo", electron)
        except Exception: pass
        stop_process("config-server", config)
        stop_process("tunnel", tunnel)


if __name__ == "__main__":
    raise SystemExit(main())
