// HEXACORE Kanban & Yol Haritası Verileri. docs/index.html bu dosyayı okur.
// Alanlar:
//   column = "todo" | "doing" | "done"
//   order  = sütun içi sıralama (küçük sayı üstte)
//   phase  = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7"
//   area   = Çip etiketi ("Mimari", "Game Core", "Frontend", "Ses & Haptic", "Backend", "Auth & Hukuk", "PWA & AdMob", "Capacitor", "DevOps")
//   subtasks = alt görev kontrol listesi
window.HEXACORE_UPDATED = "2026-11-20";

window.HEXACORE_PHASES = [
  { code: "F1", name: "Faz 1 · Monorepo & Çekirdek Motor", units: 4, color: "--t-f1", desc: "pnpm workspaces, deterministik game-core (PRNG, 6 kenarlı BFS, kaskad yerçekimi, 6 dalga paterni) ve Fastify anti-cheat iskeleti" },
  { code: "F2", name: "Faz 2 · 120Hz Motor, Ses & UI", units: 4, color: "--t-f2", desc: "120Hz Canvas interpolasyon, eriyen combo barı, tehlike nabzı, Web Audio synth, 4 tema mağazası, günlük görev ve canlanma" },
  { code: "F3", name: "Faz 3 · Backend, DB & Redis Liderlik", units: 3, color: "--t-f3", desc: "PostgreSQL 16 + Drizzle migration, Redis ZSET liderlik tabloları ve kalıcı oturum/envanter API'si" },
  { code: "F4", name: "Faz 4 · Sosyal Giriş & Mağaza Hukuku", units: 3, color: "--t-f4", desc: "Guest-First oturum, Apple/Google/Facebook Account Linking ve App Store 4.8 / KVKK hesap silme" },
  { code: "F5", name: "Faz 5 · Offline PWA & AdMob SSV", units: 2, color: "--t-f5", desc: "Service Worker + IndexedDB çevrimdışı kuyruk ve Google AdMob Server-Side Verification (SSV)" },
  { code: "F6", name: "Faz 6 · Capacitor 6 (iOS & Android)", units: 2, color: "--t-f6", desc: "Xcode & Android Studio native köprüleri, 120Hz ProMotion, Taptic Haptics ve mağaza paketleme (.AAB / IPA)" },
  { code: "F7", name: "Faz 7 · VPS, Nginx & Cloudflare Yayını", units: 2, color: "--t-f7", desc: "Docker Compose üretim topolojisi, Nginx Reverse Proxy, Cloudflare Full Strict SSL ve deploy/backup otomasyonu" },
  { code: "F8", name: "Faz 8 · Web Canlı Yayın (gyrogon.com)", units: 4, color: "--t-f8", desc: "GYROGON marka geçişi, Cloudflare DNS/Full Strict SSL, VPS Docker yayını (169.58.175.161) ve Git/CI hattı" },
  { code: "F9", name: "Faz 9 · Android Çıkışı (Google Play)", units: 4, color: "--t-f9", desc: "Capacitor Android, Google OAuth, AdMob SSV + 2x ödül, fiziksel Android QA ve Google Play (.AAB) yayını" },
  { code: "F10", name: "Faz 10 · iOS Çıkışı (App Store)", units: 3, color: "--t-f10", desc: "Apple Developer & Sign in with Apple, Capacitor iOS 120Hz ProMotion QA ve TestFlight / App Store lansmanı" },
  { code: "F11", name: "Faz 11 · v2 Çoklu Oyuncu (Multiplayer)", units: 4, color: "--t-f11", desc: "WebSocket 1v1 saldırılı düello, oda kodlu 2–8 kişilik yarış, canlı rakip mini tahtası ve hayalet düello (docs/MULTIPLAYER_V2_PLAN.md)" }
];

window.HEXACORE_CARDS = [
  // ===================== FAZ 1 (DONE) =====================
  {
    id: "f1-01-monorepo",
    column: "done",
    order: 100,
    phase: "F1",
    area: "Mimari",
    title: "1.1 · pnpm Monorepo İskeleti & Docs Merkezi",
    detail: "pnpm-workspace.yaml (packages/*, frontend, backend), ortak tsconfig.base.json, yerel PostgreSQL 16 + Redis 7 docker-compose.yml ve docs/ Kanban + landing sayfası organizasyonu.",
    subtasks: [
      "docs/ klasörü ve landing sayfası taşınması + Kanban bağlantısı",
      "pnpm-workspace.yaml ve kök package.json workspace scriptleri",
      "tsconfig.base.json, .gitignore, .env.example ve docker-compose.yml"
    ],
    days: 0.5,
    units: 1,
    ref: "Faz 1",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f1-02-gamecore-prng-wave",
    column: "done",
    order: 110,
    phase: "F1",
    area: "Game Core",
    title: "1.2 · Deterministik PRNG (Mulberry32) & 6 Dalga Direktörü",
    detail: "Hem frontend hem backend tarafından paylaşılan @hexacore/game-core paketi içinde FNV-1a seed hash, Mulberry32 PRNG, günlük bulmaca tohumu (HEXACORE-DAILY-YYYY-MM-DD) ve orijinal Hextris'in 6 dalga paternini (single, double, crosswise, halfCircle, fullCircle, spiral) üreten WaveDirector.",
    subtasks: [
      "prng.ts: FNV-1a hashSeed + Mulberry32 + getDailySeed",
      "types.ts: 60Hz tick sabitleri, güç blokları (bomb, joker, freeze) ve EngineEvent tipleri",
      "waveDirector.ts: 6 dalga paterni, DDA zorluk eğrisi ve güç bloğu üretimi"
    ],
    days: 1,
    units: 1,
    ref: "Faz 1",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f1-03-simulator-bfs",
    column: "done",
    order: 120,
    phase: "F1",
    area: "Game Core",
    title: "1.3 · 60Hz Headless Simülatör, Kaskad Yerçekimi & Modüler BFS",
    detail: "Sabit 60Hz tick ile çalışan HexacoreSimulator: 6 kenar x 8 satır matris, kenar 0-5 sarmal modüler BFS, karesel puanlama (N^2 * 10 * combo), patlama sonrası üst blokların fiziksel yerçekimiyle kayıp kaskad tetiklemesi, güç blokları ve sunucu tarafı verifyGameReplay() fonksiyonu + Vitest testleri.",
    subtasks: [
      "HexacoreSimulator: stepTick(), yerçekimi kayması ve kaskad BFS",
      "Güç blokları: Bomb (alan temizleme), Joker (joker renk), Freeze (yavaşlatma)",
      "REVIVE aksiyonu ve verifyGameReplay() anti-cheat motoru + Vitest test paketi"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 1",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f1-04-backend-skeleton",
    column: "done",
    order: 130,
    phase: "F1",
    area: "Backend",
    title: "1.4 · Fastify 5 + Drizzle Şeması + Anti-Cheat API İskeleti",
    detail: "PostgreSQL Drizzle şeması (users, game_sessions, scores, daily_seeds, user_inventory), @hexacore/game-core verifyGameReplay entegrasyonu, /api/health, /api/daily, /api/sessions/start, /api/sessions/submit, /api/leaderboard uç noktaları ve Fastify inject() testleri.",
    subtasks: [
      "Drizzle ORM şema tanımları (src/db/schema.ts)",
      "antiCheat.ts ile deterministik replay doğrulama ve sahte skor reddi",
      "Fastify + Zod REST uç noktaları ve Vitest API testleri"
    ],
    days: 1,
    units: 1,
    ref: "Faz 1",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },

  // ===================== FAZ 2 (DONE) =====================
  {
    id: "f2-01-canvas-renderer",
    column: "done",
    order: 200,
    phase: "F2",
    area: "Frontend",
    title: "2.1 · 120Hz High-DPI Polar Canvas Motoru & Efekt Katmanı",
    detail: "60Hz fizik accumulator + 120Hz render interpolasyonu, ikizkenar yamuk (trapezoid) bloklar, güç bloğu sembolleri, yay (spring) dönüşü, yönlü vektörel geri tepme (recoil), dış altıgen çevresinde eriyen renkli Combo Timer çizgisi ve tehlike nabzı (danger pulse).",
    subtasks: [
      "High-DPI Retina ölçekleme ve duyarlı koordinat sistemi",
      "Eriyen Combo Timer altıgen kenar çizgisi + kırmızı tehlike nabzı",
      "Parçacık patlamaları, yönlü çekirdek sarsıntısı ve kayan puan yazıları"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 2",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f2-02-audio-haptics",
    column: "done",
    order: 210,
    phase: "F2",
    area: "Ses & Haptic",
    title: "2.2 · Prosedürel Web Audio Synth & Titreşim Motoru",
    detail: "Harici ses dosyası gerektirmeyen, kombo seviyesine göre pentatonik/harmonik frekansı yükselen Web Audio API ses sentezleyici (rotate, lock, clear, bomb, joker, freeze, danger, revive, gameover) ve navigator.vibrate titreşim köprüsü.",
    subtasks: [
      "SynthAudioEngine.ts: kombo duyarlı armonik akor sentezi",
      "Güç blokları ve tehlike uyarısı için özel synth profilleri",
      "Tek tık ses aç/kapat ve mobil titreşim desteği"
    ],
    days: 0.75,
    units: 1,
    ref: "Faz 2",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f2-03-themes-economy",
    column: "done",
    order: 220,
    phase: "F2",
    area: "Frontend",
    title: "2.3 · 4 Görsel Tema Mağazası, Günlük Görevler & Canlanma",
    detail: "Cyberpunk Neon, Synthwave Sunset, Matrix Overdrive ve Solar High-Contrast temaları; HexaCoins kazanım ve tema satın alma akışı; günlük 3 görev takibi; oyun başına 1 kez Canlanma (Revive) modalı.",
    subtasks: [
      "themes.ts: 4 seçilebilir neon/retro renk ve çekirdek teması",
      "Mağaza ve Günlük 3 Görev (blok patlatma, kombo, skor hedefleri)",
      "Canlanma (Revive) mekaniği: dış 3 satırı temizleyip devam etme"
    ],
    days: 1,
    units: 1,
    ref: "Faz 2",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f2-04-game-modes-ui",
    column: "done",
    order: 230,
    phase: "F2",
    area: "Frontend",
    title: "2.4 · Klasik & Günlük Bulmaca Modları, Ergonomik Kontroller & HUD",
    detail: "Klasik Sonsuz Mod ve Günlük Bulmaca (Daily Seed Challenge), canvas dokunma + hızlı düşürme (swipe-down / tuş), sekme arka plana geçtiğinde otomatik duraklatma, oyun sonu anti-cheat replay doğrulama rozeti ve liderlik tablosu modalı.",
    subtasks: [
      "Klasik Mod & Günlük Bulmaca (Daily Seed) mod seçimi",
      "Canvas dokunma + swipe-down hızlı düşürme + klavye kısayolları",
      "visibilitychange otomatik duraklatma + replay onay rozeti + liderlik tablosu"
    ],
    days: 1,
    units: 1,
    ref: "Faz 2",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },

  // ===================== FAZ 3 (DONE) =====================
  {
    id: "f3-01-pg-drizzle-repo",
    column: "done",
    order: 300,
    phase: "F3",
    area: "Backend",
    title: "3.1 · Kalıcı PostgreSQL Repository & Drizzle Migration Runner",
    detail: "7 tablolu Drizzle şeması (users, shop_items, user_inventory, user_quests, game_sessions, scores, daily_seeds), SQL migration üretimi (drizzle/0000_*.sql), migrate.ts, seed.ts ve PostgreSQL/In-Memory fallback destekli PostgresGameStore.",
    subtasks: [
      "drizzle.config.ts, SQL migration (drizzle/0000_*.sql) ve src/db/migrate.ts",
      "PostgresGameStore + InMemoryGameStore CRUD ve transaction katmanı",
      "src/db/seed.ts ile başlangıç mağaza ürünleri ve 8 günlük daily seed"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 3",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f3-02-redis-leaderboard",
    column: "done",
    order: 310,
    phase: "F3",
    area: "Backend",
    title: "3.2 · Redis Sorted Set (ZSET) Küresel & Haftalık Liderlik",
    detail: "ioredis tabanlı RedisLeaderboardEngine (ZADD/ZREVRANGE/ZREVRANK/HMGET) + bağlantı kopma toleranslı InMemoryLeaderboardEngine fallback. Global, Haftalık (ISO hafta) ve Günlük liderlik + kullanıcının sırası (me.rank) ve etrafındaki rakipler (around).",
    subtasks: [
      "ioredis bağlantısı ve bağlantı kopma toleransı",
      "ZADD ile klasik, haftalık ve günlük liderlik setlerinin güncellenmesi",
      "GET /api/leaderboard/:board + kullanıcının mevcut sırası ve etrafındaki rakipler"
    ],
    days: 1,
    units: 1,
    ref: "Faz 3",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },
  {
    id: "f3-03-economy-sync-api",
    column: "done",
    order: 320,
    phase: "F3",
    area: "Backend",
    title: "3.3 · Sunucu Tarafı HexaCoins, Mağaza & 7 Günlük Giriş Serisi API",
    detail: "Sunucu tarafı profil, HexaCoins bakiyesi, mağaza satın alma/kuşanma, günlük 3 görev claim, 7 günlük giriş serisi (streak) ödül motoru, @fastify/rate-limit koruması ve Frontend entegrasyonu.",
    subtasks: [
      "GET/POST /api/shop/items, /purchase ve /equip",
      "GET/POST /api/quests, /claim ve POST /api/player/checkin (7 günlük seri)",
      "@fastify/rate-limit koruması, Vitest API testleri ve Frontend senkronizasyonu"
    ],
    days: 1,
    units: 1,
    ref: "Faz 3",
    createdAt: "2026-11-19",
    doneAt: "2026-11-19"
  },

  // ===================== FAZ 4 (DONE) =====================
  {
    id: "f4-01-guest-jwt",
    column: "done",
    order: 400,
    phase: "F4",
    area: "Auth & Hukuk",
    title: "4.1 · Guest-First Anonim Oturum & JWT Token Altyapısı",
    detail: "İlk açılışta form doldurmadan cihaz UUID'si ile otomatik anonim oyuncu hesabı oluşturulması, HS256 JWT Access (24sa) + Refresh (30gün) token mekanizması ve Frontend otomatik oturum yenileme.",
    subtasks: [
      "POST /api/auth/guest ve POST /api/auth/refresh (backend/src/services/auth.ts)",
      "Authorization Bearer JWT doğrulama + x-device-id uyumlu resolvePlayer",
      "Frontend ensureGuestAuth() ve otomatik token yenileme akışı"
    ],
    days: 1,
    units: 1,
    ref: "Faz 4",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },
  {
    id: "f4-02-social-linking",
    column: "done",
    order: 410,
    phase: "F4",
    area: "Auth & Hukuk",
    title: "4.2 · Apple, Google & Facebook Account Linking (Veri Birleştirme)",
    detail: "Anonim misafir hesabın biriken skor, rekor, HexaCoins ve temalarının tek tıkla Apple (JWKS RS256), Google (idToken) veya Facebook (Graph API) hesabıyla kayıpsız birleştirilmesi (Account Merge).",
    subtasks: [
      "backend/src/services/oauth.ts: Apple JWKS, Google tokeninfo ve Facebook Graph API doğrulama",
      "POST /api/auth/link/:provider + kayıpsız Account Merge transaction'ı",
      "Frontend Hesap & Gizlilik modalında Apple/Google/Facebook bağlama akışı"
    ],
    days: 2,
    units: 1,
    ref: "Faz 4",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },
  {
    id: "f4-03-gdpr-deletion",
    column: "done",
    order: 420,
    phase: "F4",
    area: "Auth & Hukuk",
    title: "4.3 · App Store 4.8 & KVKK Zorunlu Hesap Silme + Yasal Sayfalar",
    detail: "Ayarlar menüsüne çift onaylı 'Hesabımı ve Tüm Verilerimi Sil' butonu, DELETE /api/users/me (DB + Redis ZSET temizliği), Facebook signed_request Data Deletion Callback ve /privacy.html, /terms.html sayfaları.",
    subtasks: [
      "DELETE /api/users/me kalıcı hesap, skor ve liderlik temizleme",
      "POST /api/auth/facebook/data-deletion HMAC-SHA256 webhook uç noktası",
      "Frontend silme onay akışı + frontend/public/privacy.html ve terms.html"
    ],
    days: 1,
    units: 1,
    ref: "Faz 4",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },

  // ===================== FAZ 5 (DONE) =====================
  {
    id: "f5-01-pwa-indexeddb",
    column: "done",
    order: 500,
    phase: "F5",
    area: "PWA & AdMob",
    title: "5.1 · Offline-First PWA & IndexedDB Hamle Kuyruğu",
    detail: "vite-plugin-pwa Workbox Service Worker + 4 PNG ikon (192, 512, maskable, apple-touch); çevrimdışı oynanan oyunların IndexedDB kuyruğunda tutulup internet geldiğinde otomatik senkronize edilmesi.",
    subtasks: [
      "vite-plugin-pwa Workbox yapılandırması + gerçek PNG ikonları (frontend/public/icons/)",
      "offlineQueue.ts IndexedDB kuyruğu ve online event otomatik senkronizasyonu",
      "Çevrimdışı PWA durum göstergesi ve kuyruk sayacı"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 5",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },
  {
    id: "f5-02-admob-ssv",
    column: "done",
    order: 510,
    phase: "F5",
    area: "PWA & AdMob",
    title: "5.2 · AdMob Ödüllü Reklamlar & Server-Side Verification (SSV)",
    detail: "Google AdMob ECDSA-SHA256 SSV imza doğrulayıcı (admobSsv.ts), ad_rewards tablosu + transaction_id idempotency koruması (GET /api/ads/ssv) ve Frontend Rewarded Ad köprüsü (adBridge.ts).",
    subtasks: [
      "admobSsv.ts: Google public key önbellekleme + ECDSA-SHA256 imza doğrulama",
      "GET /api/ads/ssv + ad_rewards migration (0001_*.sql) ve çift ödül koruması",
      "Frontend adBridge.ts (Native Capacitor AdMob + Web demo fallback)"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 5",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },

  // ===================== FAZ 6 (DONE) =====================
  {
    id: "f6-01-capacitor-bridge",
    column: "done",
    order: 600,
    phase: "F6",
    area: "Capacitor",
    title: "6.1 · Capacitor 6 Kurulumu, Native Haptics, StatusBar & Yaşam Döngüsü",
    detail: "frontend/capacitor.config.ts, @capacitor/haptics (Taptic Engine), @capacitor/status-bar, @capacitor/splash-screen, @capacitor/app arka plan duraklatma (nativeBridge.ts) ve safe-area-inset çentik uyumu.",
    subtasks: [
      "capacitor.config.ts (com.hexacore.game) ve Capacitor 6 çekirdek paketleri",
      "nativeBridge.ts: Taptic Haptics, StatusBar, SplashScreen ve appStateChange pause",
      "CSS env(safe-area-inset-*) çentik ve alt bar uyumu"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 6",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },
  {
    id: "f6-02-store-release",
    column: "done",
    order: 610,
    phase: "F6",
    area: "Capacitor",
    title: "6.2 · App Store (.IPA / TestFlight) & Google Play (.AAB) Paketleme",
    detail: "iOS 120Hz ProMotion & ATT Info.plist şablonu, Android Manifest & AdMob şablonu, otomatik mobile-sync.sh scripti ve adım adım mağaza çıkış rehberi (docs/MOBILE_RELEASE_GUIDE.md).",
    subtasks: [
      "deploy/mobile/ios-Info.plist.patch.xml (120Hz ProMotion + AdMob + ATT)",
      "deploy/mobile/android-manifest.patch.xml ve deploy/mobile/mobile-sync.sh",
      "docs/MOBILE_RELEASE_GUIDE.md (TestFlight / App Store & Google Play .AAB rehberi)"
    ],
    days: 2,
    units: 1,
    ref: "Faz 6",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },

  // ===================== FAZ 7 (DONE) =====================
  {
    id: "f7-01-docker-nginx",
    column: "done",
    order: 700,
    phase: "F7",
    area: "DevOps",
    title: "7.1 · Production Docker Compose, Multi-Stage Dockerfile & Nginx Proxy",
    detail: "Multi-stage frontend/Dockerfile (Nginx Alpine) ve backend/Dockerfile (Node 22 Alpine), docker-compose.prod.yml (6 servis: postgres, redis, backend, frontend, nginx, backup) ve HEXACORE_DOMAIN değişkenli Nginx Reverse Proxy.",
    subtasks: [
      "frontend/Dockerfile + frontend/nginx.conf ve backend/Dockerfile",
      "deploy/nginx/conf.d/default.conf.template (Cloudflare Real IP, rate-limit, HSTS)",
      "docker-compose.prod.yml izole iç ağ ve servis healthcheck tanımları"
    ],
    days: 1,
    units: 1,
    ref: "Faz 7",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },
  {
    id: "f7-02-vps-cloudflare-deploy",
    column: "done",
    order: 710,
    phase: "F7",
    area: "DevOps",
    title: "7.2 · deploy.sh, Otomatik Gece Yedeği & Cloudflare SSL Yayını",
    detail: "Tek komutla sıfır kesintili VPS dağıtımı (deploy/deploy.sh), gece 03:00 7 gün rotasyonlu backup.sh / restore.sh, Cloudflare Origin SSL kurulum yardımcısı (init-ssl.sh) ve .env.production.example.",
    subtasks: [
      "deploy/deploy.sh (git pull, build, Drizzle migrate + seed, compose up, healthcheck)",
      "deploy/backup.sh ve deploy/restore.sh (otomatik .sql.gz yedekleme)",
      "deploy/init-ssl.sh, .env.production.example ve deploy/README.md"
    ],
    days: 1,
    units: 1,
    ref: "Faz 7",
    createdAt: "2026-11-19",
    doneAt: "2026-11-20"
  },

  // ===================== FAZ 8 (WEB CANLI YAYIN — gyrogon.com) =====================
  {
    id: "f8-01-gyrogon-brand-cloudflare",
    column: "done",
    order: 800,
    phase: "F8",
    area: "DevOps",
    title: "8.1 · GYROGON Marka Geçişi, gyrogon.com Tescili & Cloudflare Full Strict SSL",
    detail: "3–8 çokgen + Çiçek/Dönüşüm modlarıyla GYROGON markasına geçiş, Cloudflare Registrar üzerinden gyrogon.com tescili, @ ve www A kayıtlarının 169.58.175.161 VPS'e Proxied bağlanması ve Full (strict) + TLS 1.2/1.3 + Brotli + HTTP/3 sertleştirilmesi.",
    subtasks: [
      "gyrogon.com domain tescili ve Cloudflare DNS A kayıtları (169.58.175.161, Proxied)",
      "Cloudflare Full (strict) SSL, Always Use HTTPS, Min TLS 1.2, TLS 1.3, Brotli & HTTP/3",
      "UI, PWA manifest, yasal sayfalar, Capacitor appId (com.gyrogon.game) ve Nginx şablonunun GYROGON'a geçişi"
    ],
    days: 0.5,
    units: 1,
    ref: "Faz 8 · Web",
    createdAt: "2026-11-20",
    doneAt: "2026-11-20"
  },
  {
    id: "f8-02-vps-web-live-deploy",
    column: "done",
    order: 810,
    phase: "F8",
    area: "DevOps",
    title: "8.2 · VPS (169.58.175.161) Origin SSL, Docker Compose & Canlı Web Yayını",
    detail: "VPS (/opt/gyrogon) üzerinde Dokploy Traefik'e uyumlu docker-compose.dokploy.yml, 15 yıllık Cloudflare Origin CA sertifikası (2041'e kadar), .env.production sırları, PostgreSQL 16 + Redis 7 migration/seed ve https://gyrogon.com canlı yayını tamamlandı.",
    subtasks: [
      "SSH anahtar erişimi ve Dokploy Traefik (dokploy-network) uyumlu kurulum",
      "Cloudflare 15 yıllık Origin CA sertifikası (gyrogon.pem/key) ve /etc/dokploy/traefik/dynamic/gyrogon.yml",
      ".env.production güçlü sırlar + PostgreSQL 16 + Redis 7 + Drizzle migrate & seed",
      "https://gyrogon.com (200) ve https://gyrogon.com/api/health (postgres+redis) canlı doğrulaması"
    ],
    days: 0.5,
    units: 1,
    ref: "Faz 8 · Web",
    createdAt: "2026-11-20",
    doneAt: "2026-11-20"
  },
  {
    id: "f8-03-web-game-feel-qa",
    column: "todo",
    order: 820,
    phase: "F8",
    area: "Game Core",
    title: "8.3 · Canlı Web QA, Game Feel İnce Ayarı & Sosyal Paylaşım",
    detail: "https://gyrogon.com üzerinde masaüstü ve mobil tarayıcı testi: 3–8 çokgen, Çiçek/Dönüşüm akıcılığı, ses seviyeleri, PWA Ana Ekrana Ekle ve skor/OG paylaşım kontrolü.",
    subtasks: [
      "Canlı https://gyrogon.com üzerinde PostgreSQL + Redis ZSET liderlik ve anti-cheat testi",
      "Mobil tarayıcıda (Safari & Chrome) dokunmatik + tam genişlik Çiçek modu testi",
      "WaveDirector hız eğrisi ve ses/parçacık dengesi ince ayarı"
    ],
    days: 0.5,
    units: 1,
    ref: "Faz 8 · Web",
    createdAt: "2026-11-20"
  },
  {
    id: "f8-04-git-ci-pipeline",
    column: "done",
    order: 830,
    phase: "F8",
    area: "DevOps",
    title: "8.4 · GitHub Deposu, Actions CI & Dokploy Otomatik Dağıtım",
    detail: "Projenin github.com/ilkerismailoglu/gyrogon (private) reposuna alınması, .github/workflows/ci.yml CI hattı ve Dokploy Compose (autoDeploy) bağlantısının tamamlanması.",
    subtasks: [
      "git init, temiz commit ve github.com/ilkerismailoglu/gyrogon push",
      ".github/workflows/ci.yml (pnpm install, typecheck, build, test)",
      "Dokploy gyrogon projesi + Compose (docker-compose.dokploy.yml) auto-deploy bağlantısı"
    ],
    days: 0.25,
    units: 1,
    ref: "Faz 8 · Web",
    createdAt: "2026-11-20",
    doneAt: "2026-11-20"
  },

  // ===================== FAZ 9 (TODO — ANDROID ÇIKIŞI / GOOGLE PLAY) =====================
  {
    id: "f9-01-android-capacitor-project",
    column: "todo",
    order: 900,
    phase: "F9",
    area: "Capacitor",
    title: "9.1 · Capacitor Android Projesi & Native Köprü Kurulumu",
    detail: "@capacitor/android kurulumu, ./deploy/mobile/mobile-sync.sh ile android/ üretimi, uygulama ikonu/Splash ekranı ve AndroidManifest yapılandırması (com.gyrogon.game).",
    subtasks: [
      "pnpm --filter @hexacore/frontend add @capacitor/android",
      "./deploy/mobile/mobile-sync.sh ile Android Studio projesi üretimi",
      "Uygulama ikonu, adaptive icon, Splash ekranı ve geri tuşu/tam ekran uyumu"
    ],
    days: 1,
    units: 1,
    ref: "Faz 9 · Android",
    createdAt: "2026-11-20"
  },
  {
    id: "f9-02-android-google-oauth",
    column: "todo",
    order: 910,
    phase: "F9",
    area: "Auth & Hukuk",
    title: "9.2 · Google Cloud OAuth 2.0 & Android Google Sign-In Entegrasyonu",
    detail: "Google Cloud Console'da Web & Android OAuth Client ID (SHA-1 parmak izi dahil) tanımlanması ve frontend'deki dev: token yerine gerçek Google Sign-In bağlantısı.",
    subtasks: [
      "Google Cloud Console Android + Web OAuth Client ID ve SHA-1 kaydı",
      "@codetrix-studio/capacitor-google-auth + Web Google Identity Services bağlantısı",
      "Misafir hesaptan Google hesabına kayıpsız Account Merge testi"
    ],
    days: 1,
    units: 1,
    ref: "Faz 9 · Android",
    createdAt: "2026-11-20"
  },
  {
    id: "f9-03-android-admob-ssv",
    column: "todo",
    order: 920,
    phase: "F9",
    area: "PWA & AdMob",
    title: "9.3 · Android Google AdMob, 2x Günlük Ödül & SSV Aktivasyonu",
    detail: "@capacitor-community/admob kurulumu, AdMob panelinde Android App ID + Rewarded Ad birimlerinin açılması, https://gyrogon.com/api/ads/ssv doğrulaması ve app-ads.txt yayını.",
    subtasks: [
      "@capacitor-community/admob kurulumu ve Canlanma + 2x Ödül akışı",
      "AdMob SSV Callback URL (https://gyrogon.com/api/ads/ssv) doğrulaması",
      "frontend/public/app-ads.txt dosyasının canlıya alınması"
    ],
    days: 1,
    units: 1,
    ref: "Faz 9 · Android",
    createdAt: "2026-11-20"
  },
  {
    id: "f9-04-google-play-launch",
    column: "todo",
    order: 930,
    phase: "F9",
    area: "Capacitor",
    title: "9.4 · Fiziksel Android QA, İmzalı .AAB & Google Play Yayını",
    detail: "Fiziksel Android cihazda 120Hz/dokunmatik/çevrimdışı kuyruk testi, release keystore ile imzalı .AAB üretimi, Google Play 12 testçi / 14 gün kapalı test ve canlı yayın.",
    subtasks: [
      "Gerçek Android cihazda performans, Haptic, Offline IndexedDB ve AdMob testi",
      "Mağaza görselleri, gizlilik formu (https://gyrogon.com/privacy.html) ve imzalı .AAB",
      "Google Play Kapalı Test (12 testçi / 14 gün) -> Genel Yayın"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 9 · Android",
    createdAt: "2026-11-20"
  },

  // ===================== FAZ 10 (TODO — iOS ÇIKIŞI / APP STORE) =====================
  {
    id: "f10-01-ios-apple-developer",
    column: "todo",
    order: 1000,
    phase: "F10",
    area: "Auth & Hukuk",
    title: "10.1 · Apple Developer Hesabı, Sign in with Apple & Capacitor iOS",
    detail: "Bundle ID (com.gyrogon.game), Sign in with Apple + Services ID yapılandırması, @capacitor/ios kurulumu, 120Hz ProMotion & ATT Info.plist yamaları.",
    subtasks: [
      "Apple Developer App ID (com.gyrogon.game) ve Sign in with Apple kurulumu",
      "pnpm --filter @hexacore/frontend add @capacitor/ios + Xcode proje senkronizasyonu",
      "Info.plist (CADisableMinimumFrameDurationOnPhone 120Hz + ATT + AdMob iOS ID)"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 10 · iOS",
    createdAt: "2026-11-20"
  },
  {
    id: "f10-02-ios-device-qa",
    column: "todo",
    order: 1010,
    phase: "F10",
    area: "Capacitor",
    title: "10.2 · Gerçek iPhone 120Hz ProMotion, Taptic Engine & App Store 4.8 QA",
    detail: "Fiziksel iPhone'da 120Hz akıcılık, Taptic Engine titreşimleri, çentik/Dynamic Island uyumu, telefon çağrısında otomatik duraklatma ve App Store 4.8 hesap silme akışı doğrulaması.",
    subtasks: [
      "iPhone üzerinde 120Hz ProMotion, Taptic Haptics ve safe-area kontrolü",
      "Sign in with Apple + Account Merge + tek tıkla Hesap Silme testi",
      "iOS AdMob Rewarded SSV ve uçak modu çevrimdışı senkronizasyon testi"
    ],
    days: 1,
    units: 1,
    ref: "Faz 10 · iOS",
    createdAt: "2026-11-20"
  },
  {
    id: "f10-03-app-store-launch",
    column: "todo",
    order: 1020,
    phase: "F10",
    area: "Capacitor",
    title: "10.3 · TestFlight Beta & App Store Genel Yayın",
    detail: "App Store Connect ekran görüntüleri (6.9\", 6.5\", iPad), gizlilik beyanı (https://gyrogon.com/privacy.html), Xcode Archive -> TestFlight beta ve App Store inceleme yayını.",
    subtasks: [
      "App Store Connect ekran görüntüleri, açıklamalar ve gizlilik beyanı",
      "Xcode Archive -> TestFlight dahili/harici beta testi",
      "App Store Review gönderimi ve canlı lansman"
    ],
    days: 1.5,
    units: 1,
    ref: "Faz 10 · iOS",
    createdAt: "2026-11-20"
  },

  // ===================== FAZ 11 (TODO — v2 ÇOKLU OYUNCU / MULTIPLAYER) =====================
  {
    id: "f11-01-ws-room-hub",
    column: "todo",
    order: 1100,
    phase: "F11",
    area: "Multiplayer (v2)",
    title: "11.1 · WebSocket Oda Yöneticisi, Hızlı Eşleşme & Davet Linki",
    detail: "@fastify/websocket (/ws/multiplayer) ile 6 haneli oda kodu oluşturma (HX4K92), davet linki (?room=KOD), hızlı eşleşme kuyruğu, oda ayar senkronizasyonu (3–8 çokgen + Çokgen/Çiçek/Dönüşüm), 3-2-1 senkron geri sayım ve Nginx wss:// proxy yapılandırması. Detaylar: docs/MULTIPLAYER_V2_PLAN.md.",
    subtasks: [
      "@fastify/websocket kurulumu ve MultiplayerHub oda/kuyruk servisi (/ws/multiplayer)",
      "6 haneli oda kodu, ?room=KOD davet linki ve Hızlı Eşleşme (quick_match) akışı",
      "Ortak deterministik seed üretimi + 3-2-1 senkron maç başlatma ve rövanş döngüsü",
      "Vite dev proxy (/ws) ve üretim Nginx WebSocket Upgrade yapılandırması"
    ],
    days: 2,
    units: 1,
    ref: "v2 · Faz 11",
    createdAt: "2026-11-20"
  },
  {
    id: "f11-02-1v1-attack-duel",
    column: "todo",
    order: 1110,
    phase: "F11",
    area: "Multiplayer (v2)",
    title: "11.2 · 1v1 Saldırılı Düello Mekaniği (Kombo & Zorla Çiçek Saldırısı)",
    detail: "@hexacore/game-core içine injectAttackBlocks() ve getCompactStacks() eklenmesi; x2+ kombo veya 4+ blok temizlemede rakibe ekstra basınç çubukları veya yüksek komboda zorla çiçek açma/kapanma saldırısı gönderilmesi.",
    subtasks: [
      "HexacoreSimulator.injectAttackBlocks() ile rakip saldırı bloklarının şeritlere enjeksiyonu",
      "HexacoreSimulator.getCompactStacks() ile düşük bant genişlikli canlı yığın akışı",
      "Kombo çarpanına bağlı saldırı gücü (1–3 blok) + x4 komboda zorla Dönüşüm saldırısı",
      "İlk taşan kaybeder / bağlantı koparsa ayakta kalan kazanır maç sonuç kuralı"
    ],
    days: 1.5,
    units: 1,
    ref: "v2 · Faz 11",
    createdAt: "2026-11-20"
  },
  {
    id: "f11-03-mini-opponent-ui",
    column: "todo",
    order: 1120,
    phase: "F11",
    area: "Multiplayer (v2)",
    title: "11.3 · Lobi Modalı, Canlı Rakip Mini Tahtası & Rövanş Ekranı",
    detail: "Frontend WebSocket istemcisi (multiplayerClient.ts), Lobi modalı (Oda Oluştur / Katıl / Hızlı Eşleşme), oyun içi canlı rakip mini çokgen bileşeni (MiniOpponentBoard), gelen/giden saldırı bildirimleri ve yan yana Kazandın/Kaybettin + Rövanş ekranı.",
    subtasks: [
      "multiplayerClient.ts WebSocket istemcisi ve ?room=KOD otomatik katılım",
      "MiniOpponentBoard.tsx: Rakibin renkli yığınlarını, skorunu ve tehlike nabzını canlı çizme",
      "3-2-1 tam ekran geri sayım ve gelen/giden saldırı görsel + ses efektleri",
      "Yan yana istatistik karşılaştırmalı Kazandın/Kaybettin ve tek tıkla Rövanş ekranı"
    ],
    days: 2,
    units: 1,
    ref: "v2 · Faz 11",
    createdAt: "2026-11-20"
  },
  {
    id: "f11-04-group-room-ghost",
    column: "todo",
    order: 1130,
    phase: "F11",
    area: "Multiplayer (v2)",
    title: "11.4 · 2–8 Kişilik Arkadaş Odası & Hayalet Düello (Ghost Duel)",
    detail: "Çok oyunculu oda kapasitesinin 2–8 oyuncuya genişletilmesi (Son Ayakta Kalan & 2 Dakika Skor Yarışı) ve çevrimiçi bekleme olmadan gerçek oyuncuların kayıtlı deterministik hamlelerine (moves) karşı canlı Hayalet Düello modu.",
    subtasks: [
      "2–8 kişilik özel arkadaş odası, canlı sıralama şeridi ve 2 dakikalık skor yarışı",
      "Kayıtlı deterministik replay (moves) akışıyla sıfır beklemeli Hayalet Düello (Ghost Duel)",
      "Çoklu sunucu ölçekleme için Redis Pub/Sub oda senkronizasyonu (opsiyonel)"
    ],
    days: 2.5,
    units: 1,
    ref: "v2 · Faz 11",
    createdAt: "2026-11-20"
  }
];
