# GYROGON Workspace Kuralları

## Marka, Kapsam ve Yol Haritası
- Kullanıcıya görünen marka adı ve monorepo adı **GYROGON** (`https://gyrogon.com`, Capacitor `com.gyrogon.game`, sanal para birimi `GyroCoins`, varsayılan oyuncu adı `GyroPilot`, paketler `@gyrogon/game-core`, `@gyrogon/backend`, `@gyrogon/frontend`, yerel klasör `/Users/ilker.ismailoglu/ilker/gyrogon`).
- PostgreSQL sütun adı `hexa_coins` (ve API uyumluluk alanı `hexaCoins`) mevcut canlı veritabanı migration kararlılığı için korunur.
- Lansman öncelik sırası: **1. Web Canlı (`gyrogon.com`) → 2. Android (Google Play) → 3. iOS (App Store) → 4. v2 Çoklu Oyuncu (`docs/MULTIPLAYER_V2_PLAN.md`)**.
- Tüm yol haritası, mimari dokümanlar ve Kanban panosu (`docs/index.html`, `docs/kanban-veri.js`) yalnızca `docs/` klasöründe tutulur.

## Ortam ve Araç Kısıtları
- Paket yöneticisi olarak daima `pnpm` (workspaces) kullanılır.
- Bu Mac ortamında `node` ve `pnpm` varsayılan non-login `zsh` `$PATH` içinde değildir; kabuk komutlarından önce daima `export PATH="/Users/ilker.ismailoglu/.nvm/versions/node/v24.19.0/bin:$PATH"` eklenir.

## Frontend UI/UX Değişmezleri
- Varsayılan tema **Tema 1 (`hextris` — Açık Klasik)**, ikincil tema **Tema 2 (`cyberpunk` — Neon)**'dur. `App.tsx` içinde Tailwind `dark:` sınıfları kullanılmaz; tüm renkler açıkça `isLight` durumuna göre dallanır.
- Tema seçimi **yalnızca** üstteki **Tema Mağazası** modalında bulunur. Oyuncu adı düzenleme **yalnızca** **Hesap & Gizlilik** modalında yer alır.
- Tooltip bileşeni yalnızca fare hover'ında (`pointerType === 'mouse'`) açılır ve tıklamada/ayrılmada anında kapanır; `group-focus-within` kullanılmaz.
- Tüm etkileşimli butonlar `cursor: pointer` gösterir; modal scrollbar kanalları şeffaf arka planlıdır (`.custom-scroll`).
- Tüm kullanıcı metinleri sade, anlaşılır Türkçe olmalıdır; ham teknik ifadeler (`Replay Doğrulanamadı`, `all-time`, `2026-W47` gibi) kullanıcıya gösterilmez.
- Desteklenen çokgenler `3–8` (hepsi açık, varsayılan `6`), biçimler `polygon` / `bloom` (üstten açılan tam genişlikte çiçek şeridi, döngüsel kaydırma) / `morph`.

## Backend & Fastify v5 Kısıtları
- `@fastify/rate-limit` mutlaka rotaları kapsayan `app.register(async (api) => { ... })` eklentisinden önce kaydedilir.
- `CORS_ORIGIN` virgülle ayrılmış birden fazla origin içerebilir; diziye ayrıştırılarak `@fastify/cors`'a verilir.
