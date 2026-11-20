# GYROGON — iOS (App Store) & Android (Google Play) Yayın Rehberi

Bu rehber, Capacitor 6 yapılandırması (`frontend/capacitor.config.ts`) üzerinden GYROGON web derlemesini gerçek **iOS (.IPA / TestFlight)** ve **Android (.AAB)** mağaza paketlerine dönüştürme adımlarını içerir.

## 1. Platform Paketlerinin Eklenmesi (İlk Kurulum)
```bash
pnpm --filter @gyrogon/frontend add @capacitor/ios @capacitor/android
./deploy/mobile/mobile-sync.sh
```

## 2. iOS (Xcode / TestFlight / App Store)
1. `cd frontend && pnpm exec cap open ios` ile Xcode'u aç.
2. **Signing & Capabilities** sekmesinden:
   - Bundle Identifier: `com.gyrogon.game`
   - **Sign in with Apple** capability'sini ekle (App Store Kural 4.8 zorunluluğu).
3. `deploy/mobile/ios-Info.plist.patch.xml` içindeki `CADisableMinimumFrameDurationOnPhone` (120Hz ProMotion) ve `GADApplicationIdentifier` anahtarlarını `Info.plist` dosyasına uygula.
4. Gizlilik ve Hesap Silme URL'leri:
   - Privacy Policy URL: `https://<GYROGON_DOMAIN>/privacy.html`
   - Terms URL: `https://<GYROGON_DOMAIN>/terms.html`
   - Uygulama içi Hesap Silme: **Ayarlar → Hesabımı ve Tüm Verilerimi Sil** (`DELETE /api/users/me`).
5. **Product → Archive → Distribute App → TestFlight & App Store**.

## 3. Android (Android Studio / Google Play .AAB)
1. `cd frontend && pnpm exec cap open android` ile Android Studio'yu aç.
2. `deploy/mobile/android-manifest.patch.xml` içindeki `VIBRATE` izni ve AdMob `APPLICATION_ID` meta-data kaydını `AndroidManifest.xml`'e ekle.
3. Release Keystore oluştur (bir kez):
   ```bash
   keytool -genkey -v -keystore gyrogon-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias gyrogon
   ```
4. Google Cloud Console'da Android OAuth 2.0 Client ID için SHA-1 parmak izini tanımla:
   ```bash
   keytool -list -v -keystore gyrogon-release.jks -alias gyrogon
   ```
5. **Build → Generate Signed Bundle / APK → Android App Bundle (.AAB)** seçerek Google Play Console'a yükle.
