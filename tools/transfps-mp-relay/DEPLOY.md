# TransFPS MP Relay — Deploy na VPS

Sandbox bloqueou SSH automático. Os comandos abaixo são pra você rodar manual.

## 1. Copiar arquivos pra VPS

No seu PC local:

```bash
scp -P 2222 -i ~/.ssh/id_montador -r \
  "D:/GAMES/Jogo-dos-tatu/tools/transfps-mp-relay/server.js" \
  "D:/GAMES/Jogo-dos-tatu/tools/transfps-mp-relay/package.json" \
  "D:/GAMES/Jogo-dos-tatu/tools/transfps-mp-relay/transfps-mp.service" \
  root@72.61.25.35:/tmp/
```

## 2. Setup na VPS

```bash
ssh -p 2222 -i ~/.ssh/id_montador root@72.61.25.35 << 'EOF'
mkdir -p /opt/transfps-mp
mv /tmp/server.js /tmp/package.json /opt/transfps-mp/
cd /opt/transfps-mp
npm install --omit=dev

# Service systemd
mv /tmp/transfps-mp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable transfps-mp
systemctl start transfps-mp

# Confirma rodando
sleep 2
systemctl status transfps-mp --no-pager
curl -s http://127.0.0.1:8091/health
EOF
```

## 3. Abrir porta no firewall (interno apenas — nginx vai expor)

```bash
ssh -p 2222 -i ~/.ssh/id_montador root@72.61.25.35 \
  "ufw allow from 127.0.0.1 to any port 8091 comment 'transfps-mp local'"
```

## 4. nginx reverse proxy (WSS)

Edite `/etc/nginx/sites-available/overpixel.online` (ou onde estiver):

```nginx
# DENTRO do server { listen 443 ssl; server_name overpixel.online ...

location /transfps-mp {
    proxy_pass http://127.0.0.1:8091;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

```bash
ssh -p 2222 -i ~/.ssh/id_montador root@72.61.25.35 \
  "nginx -t && systemctl reload nginx"
```

## 5. Testar de fora

Do PC local:

```bash
curl https://overpixel.online/transfps-mp/health
# deve retornar { ok: true, port: 8091, ... }
```

WSS test no browser console:
```js
const ws = new WebSocket('wss://overpixel.online/transfps-mp');
ws.onopen = () => console.log('OK');
ws.onmessage = e => console.log(e.data);
ws.onerror = e => console.error(e);
```

## Logs

```bash
ssh -p 2222 -i ~/.ssh/id_montador root@72.61.25.35 \
  "tail -f /var/log/transfps-mp.log"
```

## Rollback / restart

```bash
ssh -p 2222 -i ~/.ssh/id_montador root@72.61.25.35 \
  "systemctl restart transfps-mp && curl -s http://127.0.0.1:8091/health"
```
