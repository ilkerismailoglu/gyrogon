---
name: gyrogon-deploy
description: >-
  GYROGON (gyrogon.com) web uygulamasını Contabo VPS (Dokploy + Traefik v3) ve Cloudflare MCP
  üzerinden güvenli şekilde canlıya alma, güncelleme, SSL yenileme ve doğrulama runbook'u.
  Kullanıcı canlıya alma, VPS kontrolü, Docker güncelleme veya Cloudflare DNS/SSL değişikliği
  istediğinde bu beceriyi kullan.
---

# GYROGON Canlı Yayın & Altyapı Runbook'u

## Altyapı Özeti
- **GitHub Repo:** `https://github.com/ilkerismailoglu/gyrogon` (`private`, `main` dalı, GitHub Actions CI: `.github/workflows/ci.yml`) — `github` MCP ile yönetilir.
- **Dokploy Panel:** `https://dokploy.limonlukezzap.com` — `dokploy` MCP ile yönetilir (`gyrogon` projesi, `docker-compose.dokploy.yml`, `autoDeploy: true`).
- **Domain & CDN:** `gyrogon.com` (Cloudflare Zone ID: `6ece1a679ede28da38a32bf197bb799d`) — `cloudflare_cloudflare` MCP eklentisi ile yönetilir (`Full (strict)`, `Always Use HTTPS`, `Min TLS 1.2`, `TLS 1.3`, `Brotli`, `HTTP/3`).
- **VPS:** Contabo `169.58.175.161` · SSH: `ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes root@169.58.175.161`
- **Compose Dosyası:** `docker-compose.dokploy.yml` (servisler: `gyrogon_postgres`, `gyrogon_redis`, `gyrogon_backend`, `gyrogon_frontend`, `gyrogon_backup`)

## Kritik Dokploy / Traefik Güvenlik Kuralı
- Sunucuda **Dokploy** ve `dokploy-traefik` (`traefik:v3.6.7`) port `80` ve `443`'ü yönetir; aynı VPS üzerinde başka projeler (`flowlish`, `nidus`, `yazboz`, `dokploy`) çalışır.
- **ASLA** host port `80` veya `443`'e yeni Nginx/konteyner bağlama ve diğer Dokploy konteynerlerine dokunma.
- `gyrogon_frontend` ve `gyrogon_backend` harici `dokploy-network` ağına bağlanır; yönlendirme `/etc/dokploy/traefik/dynamic/gyrogon.yml` üzerinden yapılır.
- **15 Yıllık Cloudflare Origin CA Sertifikası:** `/etc/dokploy/traefik/dynamic/certificates/gyrogon.pem` ve `gyrogon.key` (2041'e kadar geçerli).
- **Traefik Yeniden Yükleme Notu:** Traefik dosya izleyicisi yalnızca `.yml` değişikliklerini izler; `certificates/` altında sertifika güncellenirse kesintisiz yenileme için mutlaka `touch /etc/dokploy/traefik/dynamic/gyrogon.yml` çalıştır.

## Canlı Güncelleme (Deploy) Adımları
> Bu adımlar yalnızca kullanıcı açıkça "canlıya al" dediğinde uygulanır; aksi halde değişiklikler sadece yerel commit edilir (push yok).
1. Yerelde derleme ve testleri doğrula:
   ```bash
   export PATH="/Users/ilker.ismailoglu/.nvm/versions/node/v24.19.0/bin:$PATH"
   pnpm build && pnpm test && pnpm typecheck
   ```
2. Kodu VPS'e senkronize et (`.env.production` ve `backups/` korunur):
   ```bash
   rsync -az --delete \
     --exclude='node_modules' --exclude='dist' --exclude='.git' \
     --exclude='.env' --exclude='.env.production' --exclude='backups' --exclude='deploy/ssl' \
     -e "ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes" \
     /Users/ilker.ismailoglu/ilker/gyrogon/ root@169.58.175.161:/opt/gyrogon/
   ```
3. İmajları derle, konteynerleri güncelle ve Drizzle migration'larını uygula:
   ```bash
   ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes root@169.58.175.161 '
     cd /opt/gyrogon &&
     docker compose -f docker-compose.dokploy.yml --env-file .env.production up -d --build &&
     docker exec gyrogon_backend node dist/db/migrate.js
   '
   ```
4. Canlı doğrulama:
   - `curl -sI https://gyrogon.com` → `HTTP/2 200`
   - `curl -sI https://www.gyrogon.com` → `HTTP/2 308` (`location: https://gyrogon.com/`)
   - `curl -s https://gyrogon.com/api/health` → `{"ok":true,"store":"postgres","leaderboard":"redis",...}`
