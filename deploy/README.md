# HEXACORE — VPS, Docker Compose, Nginx & Cloudflare Yayın Kılavuzu

HEXACORE, **Flowlish** ve **Yazboz** projelerindeki ayrık konteyner standardıyla kendi VPS sunucunuzda çalışır. Şimdilik alan adı (domain) zorunlu değildir; `.env.production` içindeki `HEXACORE_DOMAIN` değişkeni bağlandığı gün tek adımda aktif edilir.

## 1. Sunucu Hazırlığı
```bash
cp .env.production.example .env.production
# .env.production içindeki şifreleri ve HEXACORE_DOMAIN değerini doldur
chmod +x deploy/*.sh deploy/mobile/*.sh
```

## 2. Tek Komutla Canlıya Alma
```bash
./deploy/deploy.sh
```
Bu script sırayla:
1. `git pull` yapar,
2. Multi-stage `backend` ve `frontend` imajlarını derler,
3. PostgreSQL 16 ve Redis 7 konteynerlerini ayağa kaldırır,
4. Drizzle SQL migration'larını (`dist/db/migrate.js`) ve başlangıç mağaza/günlük seed'lerini (`dist/db/seed.js`) uygular,
5. Tüm servisleri (`nginx`, `frontend`, `backend`, `postgres`, `redis`, `backup`) sıfır kesintiyle başlatır ve `/api/health` kontrolü yapar.

## 3. Otomatik Gece Yedekleri & Geri Yükleme
- `hexacore_backup` konteyneri her gece **03:00 UTC**'de `backups/hexacore_YYYYMMDD_HHMMSS.sql.gz` yedeğini alır ve 7 günden eski dosyaları temizler.
- Yedekten dönmek için:
  ```bash
  ./deploy/restore.sh backups/hexacore_YYYYMMDD_HHMMSS.sql.gz
  ```

## 4. Alan Adı & Cloudflare SSL (Full Strict)
Alan adı alındığında Cloudflare DNS'te A kaydını (Proxied - Turuncu Bulut) VPS IP'sine yönlendirip `./deploy/init-ssl.sh` adımlarını uygulayarak HTTPS + HSTS + WAF korumasını açabilirsin.
