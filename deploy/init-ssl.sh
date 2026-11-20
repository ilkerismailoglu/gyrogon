#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSL_DIR="$ROOT_DIR/deploy/ssl"
mkdir -p "$SSL_DIR"

echo "=== HEXACORE Cloudflare Origin SSL Kurulum Yardımcısı ==="
echo "1. Cloudflare Dashboard -> SSL/TLS -> Origin Server -> Create Certificate"
echo "2. Üretilen sertifikayı: $SSL_DIR/origin.pem"
echo "3. Üretilen gizli anahtarı: $SSL_DIR/origin.key dosyasına kaydet."
echo "4. Cloudflare SSL modunu 'Full (Strict)' yap."
echo "5. deploy/nginx/conf.d/default.conf.template içindeki 443 server bloğunun yorumunu kaldır ve ./deploy/deploy.sh çalıştır."

if [ -f "$SSL_DIR/origin.pem" ] && [ -f "$SSL_DIR/origin.key" ]; then
  chmod 600 "$SSL_DIR/origin.key"
  echo "[hexacore-ssl] Sertifika ve anahtar bulundu ve izinler (600) ayarlandı!"
else
  echo "[hexacore-ssl] Henüz origin.pem / origin.key yerleştirilmedi."
fi
