# HEXACORE v2 — Çoklu Oyuncu (Multiplayer) Mimari & Tasarım Planı

Bu doküman, v1 lansmanı sonrasında **Faz 11 (v2)** kapsamında eklenecek gerçek zamanlı ve asenkron çoklu oyunculu modların teknik tasarımını ve protokol notlarını içerir.

## 1. Neden Mevcut Mimari %80 Hazır?
- **Deterministik Çekirdek (`@hexacore/game-core`):** Aynı `seed` + `sides` (`3–8`) tüm oyunculara birebir aynı blok dalgalarını üretir (`Mulberry32`).
- **Hafif Trafik:** 60Hz oyun fiziği istemcide çalışır; sunucu yalnızca WebSocket üzerinden küçük JSON mesajları (`score`, `combo`, `stacks`, `attack`, `gameover`) taşır. Tek bir mütevazı VPS (2 vCPU / 4 GB RAM) yüzlerce eşzamanlı odayı rahatça kaldırır.
- **Cross-Play:** Web PWA, Android ve iOS (Capacitor) aynı `wss://` uç noktası üzerinden birbirine karşı oynayabilir.

---

## 2. Planlanan 3 Multiplayer Modu

### Mod A · 1v1 Canlı Düello (Kombo Saldırılı · Öncelik 1)
- İki oyuncu aynı `seed`, aynı çokgen (`3–8`) ve aynı biçimde (`Çokgen / Çiçek / Dönüşüm`) eşzamanlı başlar.
- Ekranın köşesinde rakibin **canlı mini çokgeni** (`MiniOpponentBoard`), skoru, kombosu ve tehlike durumu gösterilir.
- **Saldırı Mekaniği:**
  - `x2+` kombo veya `4+` blok patlatıldığında rakibe `1–3` adet ekstra hızlı basınç bloğu (`injectAttackBlocks`) gönderilir.
  - Yüksek kombolarda (`x4+`) rakibin tahtasını kısa süreliğine **zorla çiçek gibi açıp kapatma** (Dönüşüm saldırısı) veya hız artışı tetiklenebilir.
- **Kazanma Koşulu:** İlk taşan kaybeder, ayakta kalan anında kazanır. Bağlantı koparsa ayakta kalan kazanır.

### Mod B · Oda Kodlu Arkadaş Yarışı (2–8 Oyuncu)
- Tek tıkla **"Oda Oluştur"** → 6 haneli kolay kod (örn. `HX4K92`) ve paylaşılabilir davet linki (`?room=HX4K92`).
- Oda sahibi lobide çokgeni (`3–8`) ve biçimi (`Çokgen / Çiçek / Dönüşüm`) seçer; tüm oyunculara canlı yansır.
- **Oyun Biçimleri:** *Son Ayakta Kalan* veya *2 Dakika Skor Yarışı*.
- Maç sonunda tüm oyuncular tek tıkla **"Rövanş"** isteyip yeni `seed` ile aynı odada tekrar başlayabilir.

### Mod C · Hayalet Düello (Ghost Duel — Sıfır Bekleme)
- Çevrimiçi oyuncu azken bile bekleme olmaz.
- Backend veritabanındaki (`game_sessions.move_hash` / kaydedilmiş `moves`) gerçek oyuncuların hamle kayıtları deterministik `HexacoreSimulator` ile istemcide canlı hayalet rakip olarak oynatılır.

---

## 3. Teknik Protokol & Paket Taslağı

### `@hexacore/game-core` Eklemeleri
- `HexacoreSimulator.injectAttackBlocks(count: number, seedHint?: number): number` — Rakip saldırısından gelen ekstra düşen blokları ayrı şeritlere dengeli enjekte eder.
- `HexacoreSimulator.getCompactStacks(): number[][]` — Her kenardaki renk indekslerini (~40 byte) döndürür; canlı mini-tahta akışı için kullanılır.

### `@hexacore/backend` (`@fastify/websocket` + Redis Pub/Sub)
- **Uç Nokta:** `GET /ws/multiplayer`
- **Nginx Proxy:** `location /ws/` için `proxy_http_version 1.1`, `Upgrade`, `Connection "upgrade"` başlıkları.
- **İstemci → Sunucu Mesajları:**
  - `create_room` (`playerName`, `sides`, `layout`, `isPublic`)
  - `join_room` (`code`, `playerName`)
  - `quick_match` (`playerName`, `sides`, `layout`)
  - `update_settings` (`sides`, `layout` — yalnızca oda sahibi)
  - `toggle_ready` / `start_match`
  - `state_update` (`score`, `combo`, `maxCombo`, `blocksCleared`, `stacks`, `rotationSteps`, `danger` — ~180ms aralıkla)
  - `send_attack` (`power: 1..3`, `kind: 'blocks' | 'morph'`)
  - `player_gameover` (`score`, `maxCombo`, `blocksCleared`)
  - `request_rematch` / `leave_room`
- **Sunucu → İstemci Mesajları:**
  - `welcome`, `room_state`, `match_countdown` (`3..2..1`), `match_start` (`seed`, `sides`, `layout`), `opponent_state`, `incoming_attack`, `match_result`, `opponent_left`, `error`.

### `@hexacore/frontend` Eklemeleri
- `frontend/src/services/multiplayerClient.ts` — Tip güvenli WebSocket istemcisi ve `?room=KOD` URL otomatik katılımı.
- `frontend/src/components/MiniOpponentBoard.tsx` — Rakibin canlı renkli yığınlarını çizen kompakt Canvas bileşeni.
- **Lobi Modalı:** Hızlı Eşleşme, Oda Oluştur, Oda Koduyla Katıl, Davet Linki Kopyala, Hazır Durumu.
- **Maç İçi HUD:** 3-2-1 tam ekran geri sayım, gelen/giden saldırı flaş bildirimi ve yan yana **Kazandın / Kaybettin + Rövanş** sonuç ekranı.
