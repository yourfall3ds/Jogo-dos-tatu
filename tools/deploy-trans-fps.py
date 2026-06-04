#!/usr/bin/env python3
"""
Deploy TransFPS — script standalone.
LOCAL:   C:\\Users\\LucasPrinty\\Desktop\\DESKTOP\\SmartApps\\Meus projetos\\deploy-trans-fps.py
PROJETO: D:\\GAMES\\Jogo-dos-tatu

O TransFPS tem DUAS partes que vivem separadas na VPS:
  • CLIENTE — site estático puro (ESM nativo, SEM build/bundler). src/ + index.html
    + assets/ servidos por nginx em /var/www/transfps/. Atualiza no scp/extract.
  • SERVIDOR — processo Colyseus (Node) em /opt/transfps-colyseus/, rodando como
    systemd 'transfps-colyseus.service'. Só passa a valer quando os arquivos novos
    são enviados E o serviço é REINICIADO.

Este script cobre os dois, com logs ao vivo, verify MD5, backup, restart do
serviço e health check (carrega index.html + faz matchmake real no Colyseus).

Uso:
    python deploy-trans-fps.py                 # deploy completo (cliente + servidor + purge + health)
    python deploy-trans-fps.py --only-client   # só o cliente (src/index/assets) — NÃO reinicia Colyseus
    python deploy-trans-fps.py --only-server   # só o servidor Colyseus (envia + reinicia)
    python deploy-trans-fps.py --only-health   # só health check
    python deploy-trans-fps.py --only-purge    # só purga Cloudflare
    python deploy-trans-fps.py --no-assets     # cliente SEM a pasta assets (deploy rápido de código)
    python deploy-trans-fps.py --dry-run       # mostra o que faria, sem executar
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import logging
import os
import shlex
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Optional

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# =========================================================================
# CONFIG
# =========================================================================

PROJECT_ROOT = Path(r"D:\GAMES\Jogo-dos-tatu")

# Logs ficam na raiz de "Meus projetos" (junto do script)
LOG_DIR = Path(__file__).resolve().parent / "deploy-logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── SSH da VPS (TransFPS usa porta 2222 + key id_montador, NÃO o alias 'vps') ──
VPS_HOST = "72.61.25.35"
VPS_PORT = "2222"
VPS_USER = "root"
SSH_KEY = str(Path.home() / ".ssh" / "id_montador")
SSH_BASE = ["ssh", "-p", VPS_PORT, "-i", SSH_KEY,
            "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}"]
SCP_BASE = ["scp", "-P", VPS_PORT, "-i", SSH_KEY, "-o", "StrictHostKeyChecking=no"]

# Git Bash do Windows — usado pra tar (Python no Windows não acha via PATH)
BASH_EXE = r"C:\Program Files\Git\bin\bash.exe" if sys.platform == "win32" else "bash"

# ── CLIENTE (estático) ──
CLIENT_VPS_PATH = "/var/www/transfps"
# O que vai no tarball do cliente. assets/ é grande (~centenas de MB) → opcional.
CLIENT_FILES = ["index.html", "src"]
CLIENT_ASSETS = ["assets"]  # incluído por padrão; --no-assets pula

# ── SERVIDOR (Colyseus) ──
SERVER_LOCAL_DIR = PROJECT_ROOT / "tools" / "transfps-colyseus"
SERVER_VPS_PATH = "/opt/transfps-colyseus"
SERVER_SERVICE = "transfps-colyseus.service"
# Só o src/ do servidor é enviado (node_modules/.env ficam na VPS intactos).
SERVER_SYNC_SUBDIR = "src"

# ── Cloudflare ──
CF_ZONE = "3cf1649c9da10ecc4b86281cad164c13"      # zona overpixel.online (TransFPS)
CF_TOKEN_REMOTE_PATH = "/root/.secure_cloudflare/overpixel.online.env"

# ── Health ──
CLIENT_DOMAIN = "app.overpixel.online"
CLIENT_PATH = "/transfps/"
# endpoint de matchmake do Colyseus (atrás do nginx)
COLYSEUS_MATCHMAKE = f"https://{CLIENT_DOMAIN}/transfps-cs/matchmake/joinOrCreate/arena"
HEALTH_TIMEOUT = 15
HTTP_USER_AGENT = "Mozilla/5.0 (compatible; TransFPSDeploy/1.0)"

# =========================================================================
# COR + LOG  (idêntico ao deploy.py do Launcher)
# =========================================================================

USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

def c(text, color):
    if not USE_COLOR:
        return text
    codes = {"r": "31", "g": "32", "y": "33", "b": "34", "m": "35", "cy": "36", "bold": "1"}
    return f"\033[{codes.get(color, '0')}m{text}\033[0m"

def setup_logger():
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    log_path = LOG_DIR / f"deploy-transfps-{ts}.log"
    logger = logging.getLogger("deploy-transfps")
    logger.setLevel(logging.DEBUG)
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(fh)
    return logger, log_path, ts

def info(logger, msg): print(f"     {msg}"); logger.info(msg)
def ok(logger, msg):   print(c(f"[OK] {msg}", "g")); logger.info(f"OK: {msg}")
def warn(logger, msg): print(c(f"[!] {msg}", "y")); logger.warning(msg)
def err(logger, msg):  print(c(f"[ERRO] {msg}", "r")); logger.error(msg)
def step(logger, msg): print(c(f"\n>>> {msg}", "cy")); logger.info(f"STEP: {msg}")

def run(cmd, cwd=None, timeout=120, capture=True, logger=None):
    """SILENT (capture=True): segura stdout/stderr p/ parsing.
    LIVE (capture='live'/False): joga tudo no terminal em tempo real."""
    if logger:
        logger.debug(f"$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    shell = isinstance(cmd, str)
    if capture is False or capture == "live":
        prefix = c("  | ", "cy")
        proc = subprocess.Popen(
            cmd, cwd=cwd, shell=shell, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            bufsize=1, universal_newlines=True,
        )
        collected = []
        try:
            for line in iter(proc.stdout.readline, ""):
                line = line.rstrip()
                if line:
                    print(f"{prefix}{line}", flush=True)
                    collected.append(line)
                    if logger: logger.debug(f"LIVE: {line}")
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            return 124, "\n".join(collected), "timeout"
        return proc.returncode, "\n".join(collected), ""
    p = subprocess.run(cmd, cwd=cwd, capture_output=capture, text=True, timeout=timeout, check=False, shell=shell)
    if logger and capture:
        if p.stdout: logger.debug(f"STDOUT: {p.stdout[:1500]}")
        if p.stderr: logger.debug(f"STDERR: {p.stderr[:1500]}")
    return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()

def ssh(remote_cmd, timeout=120, logger=None, capture=True):
    return run(SSH_BASE + [remote_cmd], timeout=timeout, capture=capture, logger=logger)

def to_posix(p: str) -> str:
    """C:\\foo -> /c/foo  (pro Git Bash)."""
    s = p.replace("\\", "/")
    if len(s) > 1 and s[1] == ":":
        s = "/" + s[0].lower() + s[2:]
    return s

# =========================================================================
# STEP: TARBALL (genérico — cliente ou servidor)
# =========================================================================

def make_tarball(logger, base_dir: Path, files: list[str], out_name: str, dry_run=False) -> Optional[tuple]:
    """Cria tarball de `files` (relativos a base_dir). Retorna (path_win, md5)."""
    present = [f for f in files if (base_dir / f).exists()]
    if not present:
        err(logger, f"nenhum arquivo encontrado em {base_dir}")
        return None
    info(logger, f"incluindo: {', '.join(present)}")
    if dry_run:
        return ("/tmp/dry-run.tar.gz", "00000000")

    tmp_dir = Path(__file__).resolve().parent / ".deploy-tmp-transfps"
    tmp_dir.mkdir(exist_ok=True)
    tar_win = str(tmp_dir / out_name)
    tar_posix = to_posix(tar_win)

    t0 = time.time()
    if sys.platform == "win32":
        base_posix = to_posix(str(base_dir))
        files_arg = " ".join(shlex.quote(f) for f in present)
        bash_cmd = (f"rm -f {shlex.quote(tar_posix)} && cd {shlex.quote(base_posix)} && "
                    f"tar czf {shlex.quote(tar_posix)} {files_arg}")
        rc, out, errout = run([BASH_EXE, "-c", bash_cmd], timeout=300, capture=True, logger=logger)
    else:
        rc, out, errout = run(["tar", "czf", tar_win] + present, cwd=base_dir, timeout=300, capture=True, logger=logger)
    dt = time.time() - t0
    if rc != 0:
        err(logger, f"tar FALHOU (exit {rc}): {errout[:300]}")
        return None

    h = hashlib.md5()
    with open(tar_win, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    md5 = h.hexdigest()
    size_mb = os.path.getsize(tar_win) / (1024 * 1024)
    ok(logger, f"tarball {out_name} criado em {dt:.1f}s — {size_mb:.1f} MB — MD5 {md5[:12]}...")
    return (tar_win, md5)

def scp_verify(logger, tar_win, expected_md5, remote_tmp, dry_run=False) -> bool:
    """SCP do tarball + verify MD5 no destino."""
    if dry_run:
        info(logger, f"(dry-run) scp {tar_win} -> {remote_tmp}")
        return True
    info(logger, f"scp -> {VPS_HOST}:{remote_tmp}")
    t0 = time.time()
    rc, out, errout = run(SCP_BASE + [tar_win, f"{VPS_USER}@{VPS_HOST}:{remote_tmp}"],
                          timeout=600, capture=True, logger=logger)
    if rc != 0:
        err(logger, f"scp FALHOU (exit {rc}): {errout[:300]}")
        return False
    ok(logger, f"scp OK em {time.time()-t0:.1f}s")
    rc2, out2, _ = ssh(f"md5sum {remote_tmp}", timeout=60, logger=logger)
    remote_md5 = out2.split()[0] if out2 else ""
    if remote_md5 != expected_md5:
        err(logger, f"MD5 NÃO bate! local={expected_md5[:12]} remoto={remote_md5[:12]}")
        return False
    ok(logger, f"MD5 remoto bate: {remote_md5[:12]}...")
    return True

# =========================================================================
# STEP 1: CLIENTE (estático)
# =========================================================================

def step_client(logger, include_assets=True, dry_run=False) -> bool:
    step(logger, "CLIENTE — tarball + scp + extract (site estático)")
    files = list(CLIENT_FILES)
    if include_assets:
        files += CLIENT_ASSETS
    else:
        warn(logger, "--no-assets: enviando SÓ código (src/index), sem assets/")

    tar_info = make_tarball(logger, PROJECT_ROOT, files, "transfps-client.tar.gz", dry_run)
    if not tar_info:
        return False
    tar_win, md5 = tar_info

    if not scp_verify(logger, tar_win, md5, "/tmp/transfps-client.tar.gz", dry_run):
        return False

    if dry_run:
        info(logger, f"(dry-run) extract em {CLIENT_VPS_PATH}")
        return True

    # Backup leve (hardlink — instantâneo) + extract por cima.
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    info(logger, f"backup (hardlink) + extract em {CLIENT_VPS_PATH}")
    rc, out, errout = ssh(
        f"cd {CLIENT_VPS_PATH} && "
        f"cp -al src \"src.bak-deploy-{ts}\" 2>/dev/null; "
        f"tar xzf /tmp/transfps-client.tar.gz && "
        f"chown -R www-data:www-data {CLIENT_VPS_PATH} 2>/dev/null; "
        f"rm -f /tmp/transfps-client.tar.gz && "
        f"echo EXTRACT_OK",
        timeout=300, logger=logger,
    )
    if "EXTRACT_OK" not in out:
        err(logger, f"extract FALHOU: {errout[:300] or out[:300]}")
        return False
    ok(logger, "cliente deployado")

    # cleanup de backups antigos de src (mantém 3)
    rc, out, _ = ssh(f"cd {CLIENT_VPS_PATH} && ls -1dt src.bak-deploy-* 2>/dev/null", timeout=30, logger=logger)
    backs = [b.strip() for b in (out or "").splitlines() if b.strip()]
    if len(backs) > 3:
        old = backs[3:]
        paths = " ".join(shlex.quote(f"{CLIENT_VPS_PATH}/{b}") for b in old)
        ssh(f"rm -rf {paths}", timeout=60, logger=logger)
        info(logger, f"limpou {len(old)} backups antigos de src")
    return True

# =========================================================================
# STEP 2: SERVIDOR (Colyseus)
# =========================================================================

def step_server(logger, dry_run=False) -> bool:
    step(logger, "SERVIDOR — tarball src + scp + extract + RESTART do Colyseus")
    if not SERVER_LOCAL_DIR.exists():
        err(logger, f"servidor local não existe: {SERVER_LOCAL_DIR}")
        return False

    tar_info = make_tarball(logger, SERVER_LOCAL_DIR, [SERVER_SYNC_SUBDIR],
                            "transfps-server.tar.gz", dry_run)
    if not tar_info:
        return False
    tar_win, md5 = tar_info

    if not scp_verify(logger, tar_win, md5, "/tmp/transfps-server.tar.gz", dry_run):
        return False

    if dry_run:
        info(logger, f"(dry-run) extract em {SERVER_VPS_PATH} + restart {SERVER_SERVICE}")
        return True

    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    info(logger, f"backup src + extract em {SERVER_VPS_PATH}")
    rc, out, errout = ssh(
        f"cd {SERVER_VPS_PATH} && "
        f"cp -al src \"src.bak-deploy-{ts}\" 2>/dev/null; "
        f"tar xzf /tmp/transfps-server.tar.gz && "
        f"rm -f /tmp/transfps-server.tar.gz && "
        f"echo EXTRACT_OK",
        timeout=300, logger=logger,
    )
    if "EXTRACT_OK" not in out:
        err(logger, f"extract servidor FALHOU: {errout[:300] or out[:300]}")
        return False
    ok(logger, "arquivos do servidor enviados")

    # Valida sintaxe dos rooms ANTES de reiniciar (não derruba o serviço com código quebrado).
    info(logger, "validando sintaxe (node --check) antes do restart…")
    rc, out, errout = ssh(
        f"cd {SERVER_VPS_PATH} && "
        f"for f in src/rooms/*.js src/index.js; do node --check \"$f\" || exit 1; done && echo SYNTAX_OK",
        timeout=120, logger=logger,
    )
    if "SYNTAX_OK" not in out:
        err(logger, f"SINTAXE INVÁLIDA — NÃO vou reiniciar (serviço segue no ar com o código antigo)")
        err(logger, f"erro: {errout[:400] or out[:400]}")
        return False
    ok(logger, "sintaxe OK")

    # Restart do systemd
    info(logger, f"systemctl restart {SERVER_SERVICE}")
    rc, out, errout = ssh(f"systemctl restart {SERVER_SERVICE} && sleep 3 && "
                          f"systemctl is-active {SERVER_SERVICE}", timeout=60, logger=logger)
    if out.strip() != "active":
        err(logger, f"serviço NÃO ficou active após restart: '{out.strip()}'")
        info(logger, "últimas linhas do log do serviço:")
        rc2, jout, _ = ssh(f"journalctl -u {SERVER_SERVICE} -n 12 --no-pager", timeout=30, logger=logger)
        for ln in (jout or "").splitlines()[-12:]:
            info(logger, f"  {ln}")
        return False
    ok(logger, f"{SERVER_SERVICE} ATIVO")

    # cleanup backups antigos (mantém 3)
    rc, out, _ = ssh(f"cd {SERVER_VPS_PATH} && ls -1dt src.bak-deploy-* 2>/dev/null", timeout=30, logger=logger)
    backs = [b.strip() for b in (out or "").splitlines() if b.strip()]
    if len(backs) > 3:
        old = backs[3:]
        paths = " ".join(shlex.quote(f"{SERVER_VPS_PATH}/{b}") for b in old)
        ssh(f"rm -rf {paths}", timeout=60, logger=logger)
        info(logger, f"limpou {len(old)} backups antigos do servidor")
    return True

# =========================================================================
# STEP 3: CLOUDFLARE PURGE
# =========================================================================

def get_cf_token(logger):
    rc, token, _ = ssh(f"source {CF_TOKEN_REMOTE_PATH} && echo $CF_API_TOKEN", logger=logger)
    if rc != 0 or not token:
        err(logger, "CF_API_TOKEN não encontrado no servidor")
        return None
    return token.strip()

def step_purge(logger, dry_run=False) -> bool:
    step(logger, "CLOUDFLARE — purge da zona overpixel.online")
    if dry_run:
        info(logger, "(dry-run) purge")
        return True
    token = get_cf_token(logger)
    if not token:
        return False
    cmd = [
        "curl", "-sS", "-X", "POST",
        f"https://api.cloudflare.com/client/v4/zones/{CF_ZONE}/purge_cache",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        "--data", '{"purge_everything":true}',
    ]
    rc, out, _ = run(cmd, timeout=30, logger=logger)
    if rc == 0 and '"success":true' in out:
        ok(logger, "purge OK")
        info(logger, "aguardando 3s pra CF propagar…")
        time.sleep(3)
        return True
    err(logger, f"purge FALHOU: {out[:200]}")
    return False

# =========================================================================
# STEP 4: HEALTH  (cliente carrega + Colyseus matchmake real)
# =========================================================================

def http_get(url, timeout=HEALTH_TIMEOUT, headers=None, method="GET", data=None):
    h = {"User-Agent": HTTP_USER_AGENT, "Accept": "*/*"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, method=method, headers=h,
                                 data=data.encode() if data else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(16384)
    except urllib.error.HTTPError as e:
        return e.code, e.read(4096) if hasattr(e, "read") else b""
    except Exception as e:
        return 0, str(e).encode()

def step_health(logger, check_server=True) -> bool:
    step(logger, "HEALTH — cliente carrega + Colyseus responde")
    all_ok = True

    # 1) index.html do cliente
    status, body = http_get(f"https://{CLIENT_DOMAIN}{CLIENT_PATH}",
                            headers={"Cache-Control": "no-cache"})
    if status in (200, 206) and b"<" in body:
        ok(logger, f"  cliente index.html: status={status}")
    else:
        err(logger, f"  cliente index.html: status={status}")
        all_ok = False

    # 2) main.js (entry do jogo) carrega?
    status2, _ = http_get(f"https://{CLIENT_DOMAIN}{CLIENT_PATH}src/main.js",
                          headers={"Range": "bytes=0-0"})
    if status2 in (200, 206):
        ok(logger, f"  src/main.js: status={status2}")
    else:
        err(logger, f"  src/main.js: status={status2}")
        all_ok = False

    # 3) Colyseus matchmake real (prova que o servidor aceita conexão anônima)
    if check_server:
        payload = json.dumps({"nickname": "DeployHealth", "map": "arena",
                              "maxPlayers": 8, "mode": "deathmatch"})
        s3, b3 = http_get(COLYSEUS_MATCHMAKE, method="POST",
                          headers={"Content-Type": "application/json"}, data=payload)
        txt = b3.decode("utf-8", "replace") if b3 else ""
        if s3 == 200 and '"room"' in txt and '"sessionId"' in txt:
            ok(logger, f"  Colyseus matchmake: status=200 (sala criada, sessionId OK)")
        else:
            err(logger, f"  Colyseus matchmake: status={s3} body={txt[:160]}")
            all_ok = False

    if all_ok:
        ok(logger, "HEALTH: PASS")
    else:
        err(logger, "HEALTH: FAIL")
    return all_ok

# =========================================================================
# MAIN
# =========================================================================

def main():
    parser = argparse.ArgumentParser(description="Deploy TransFPS (cliente estático + servidor Colyseus)")
    parser.add_argument("--only-client", action="store_true", help="só o cliente (não reinicia Colyseus)")
    parser.add_argument("--only-server", action="store_true", help="só o servidor Colyseus (envia + reinicia)")
    parser.add_argument("--only-health", action="store_true")
    parser.add_argument("--only-purge", action="store_true")
    parser.add_argument("--no-assets", action="store_true", help="cliente sem a pasta assets (deploy rápido de código)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-color", action="store_true")
    args = parser.parse_args()

    global USE_COLOR
    if args.no_color: USE_COLOR = False

    logger, log_path, deploy_ts = setup_logger()

    print(c("+===============================================+", "cy"))
    print(c(f"|  DEPLOY TRANSFPS  -  {deploy_ts}        |", "cy"))
    print(c("+===============================================+", "cy"))
    info(logger, f"projeto: {PROJECT_ROOT}")
    info(logger, f"vps: {VPS_USER}@{VPS_HOST}:{VPS_PORT}")
    info(logger, f"log: {log_path}")
    if args.dry_run:
        warn(logger, "DRY RUN — nada vai executar de verdade")

    if not PROJECT_ROOT.exists():
        err(logger, f"PROJECT_ROOT não existe: {PROJECT_ROOT}")
        sys.exit(1)

    t_start = time.time()
    results: dict[str, bool] = {}

    if args.only_health:
        results["health"] = step_health(logger)
    elif args.only_purge:
        results["purge"] = step_purge(logger, args.dry_run)
        results["health"] = step_health(logger)
    elif args.only_client:
        results["cliente"] = step_client(logger, not args.no_assets, args.dry_run)
        if results["cliente"]:
            results["purge"] = step_purge(logger, args.dry_run)
            results["health"] = step_health(logger, check_server=False)
    elif args.only_server:
        results["servidor"] = step_server(logger, args.dry_run)
        if results["servidor"]:
            results["health"] = step_health(logger)
    else:
        # DEPLOY COMPLETO: cliente + servidor + purge + health
        results["cliente"] = step_client(logger, not args.no_assets, args.dry_run)
        results["servidor"] = step_server(logger, args.dry_run)
        results["purge"] = step_purge(logger, args.dry_run)
        results["health"] = step_health(logger)

    # Relatório
    print()
    print(c("=" * 50, "cy"))
    print(c(f"RELATÓRIO FINAL - {time.time() - t_start:.1f}s", "bold"))
    print(c("=" * 50, "cy"))
    for name, v in results.items():
        print(f"  {c('[OK]', 'g') if v else c('[FAIL]', 'r')} {name}")
    print(f"\nBackups (rollback):")
    print(f"  cliente:  {CLIENT_VPS_PATH}/src.bak-deploy-*")
    print(f"  servidor: {SERVER_VPS_PATH}/src.bak-deploy-*")
    print(f"Log: {log_path}")
    total_ok = all(results.values()) if results else False
    print(c("\n>>> SUCESSO TOTAL <<<", "g") if total_ok else c("\n>>> CONCLUÍDO COM ERROS <<<", "y"))
    sys.exit(0 if total_ok else 1)

if __name__ == "__main__":
    main()
