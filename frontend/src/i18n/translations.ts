import { BoardLayout, PolygonSides } from '@gyrogon/game-core';
import { ActivePowerUpKind } from '../canvas/GyrogonCanvasView';
import { AvatarFrameId, PresetAvatarId } from '../components/AvatarCatalog';
import { ThemeId } from '../themes/themes';

export type Language = 'tr' | 'en' | 'sq';

export const LANGUAGE_STORAGE_KEY = 'gyrogon_lang_v1';

export interface LanguageOption {
  code: Language;
  short: string;
  label: string;
  flag: string;
  locale: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'tr', short: 'TR', label: 'Türkçe', flag: '🇹🇷', locale: 'tr-TR' },
  { code: 'en', short: 'EN', label: 'English', flag: '🇬🇧', locale: 'en-US' },
  { code: 'sq', short: 'SQ', label: 'Shqip', flag: '🇦🇱', locale: 'sq-AL' }
];

export function isSupportedLanguage(val: unknown): val is Language {
  return val === 'tr' || val === 'en' || val === 'sq';
}

export function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(saved)) return saved;
  } catch {
    // ignore
  }
  try {
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('sq')) return 'sq';
    if (navLang.startsWith('en')) return 'en';
  } catch {
    // ignore
  }
  return 'tr';
}

export function getLocale(lang: Language): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === lang)?.locale ?? 'tr-TR';
}

export interface TranslationDict {
  siteTitle: string;
  languageLabel: string;
  languageSelectTitle: string;
  languageSelectDesc: string;
  langTooltip: string;

  sideBadgeSuffix: string;
  polygons: Record<PolygonSides, string>;
  layouts: Record<BoardLayout, string>;
  powerups: Record<
    ActivePowerUpKind,
    { title: string; incomingDesc: string; activatedDesc: string }
  >;
  themes: Record<ThemeId, { badge: string; name: string; subtitle: string }>;
  quests: Record<string, string>;

  // Auth & Account Feedback
  errNameShort: string;
  errEmailInvalid: string;
  errPasswordShort: string;
  errPasswordMismatch: string;
  msgAccountCreated: string;
  msgLoginMerged: string;
  msgLoginSynced: string;
  msgNameUpdated: string;
  errNameUpdateFailed: string;
  msgLoggedOut: string;
  accountProfileTab: string;
  msgAvatarUpdated: string;
  forgotPasswordLink: string;
  resetPasswordTitle: string;
  resetPasswordIntro: string;
  sendResetCodeBtn: string;
  resetCodeField: string;
  resetCodePlaceholder: string;
  newPasswordField: string;
  confirmNewPasswordField: string;
  resetPasswordSubmitBtn: string;
  resendCodeBtn: string;
  backToLoginBtn: string;
  errResetCodeInvalid: string;
  msgResetCodeSent: string;
  msgResetDevCodeNotice: string;
  msgPasswordResetSuccess: string;

  // Score Share
  shareTitle: string;
  shareDailyMode: string;
  shareClassicMode: string;
  shareScoreWord: string;
  sharePointsExcl: string;
  shareMaxComboPrefix: string;
  shareCta: string;

  // PowerUp Badges
  powerupIncoming: string;
  powerupActive: string;

  // Stats Section
  statsTitle: string;
  statsLoadingShort: string;
  statsJoinedPrefix: string;
  statsGamesLabel: string;
  statsClearedLabel: string;
  statsClearedSub: string;
  statsBestScoreLabel: string;
  statsBestComboLabel: string;
  statsBestComboSub: string;
  statsTotalScoreLabel: string;
  statsAllGamesSub: string;
  statsAvgScoreLabel: string;
  statsAvgSub: string;
  statsCoinEarningsLabel: string;
  statsMatchCoinsSub: string;
  statsQuestsDoneLabel: string;
  statsQuestsDoneSub: string;
  statsPolyRecordsHeader: string;
  statsFavoritePrefix: string;
  statsSideSuffix: string;
  statsGameUnit: string;
  statsRecentHeader: string;
  statsPointsUnit: string;
  statsBlocksUnit: string;
  statsEmptyLong: string;

  // HUD & Top Bars
  recordUpper: string;
  comboUpper: string;
  morphToBloom: string;
  morphToPolygon: string;
  dangerAlert: string;
  offlineShort: string;
  queuedSuffix: string;
  coinsBalanceArenaAria: string;
  settingsAndHelpAria: string;
  rewards: string;
  rewardsAria: string;
  shop: string;
  shopAria: string;
  leaderboard: string;
  leaderboardAria: string;
  coinsTooltip: string;
  coinsBalanceAria: string;
  accountGuestTooltip: string;
  accountMyTooltip: string;
  guestAuthBtn: string;
  settingsTooltip: string;

  // Playing Center Controls
  resumeWithKey: string;
  pauseWithKey: string;
  resumeGame: string;
  pauseGame: string;
  restartGame: string;
  soundOffTooltip: string;
  soundOnTooltip: string;

  // Menu & Bottom Switcher
  dailyPuzzleTitle: string;
  todayWord: string;
  dailySameOrderSub: string;
  menuBloomSub: string;
  menuMorphSub: string;
  menuClassicSub: string;
  preparingBtn: string;
  playUpperBtn: string;
  modeClassicTooltip: string;
  modeDailyTooltip: string;
  classicShort: string;
  dailyShort: string;
  layoutPolygonTooltip: string;
  layoutBloomTooltip: string;
  layoutMorphTooltip: string;
  navCategoriesAria: string;
  playShort: string;
  account: string;

  // Playing Bottom Controls
  leftMobileBtn: string;
  fastMobileBtn: string;
  rightMobileBtn: string;
  orWord: string;
  shiftVerb: string;
  rotateOrShiftVerb: string;
  rotateVerb: string;
  speedUpVerb: string;
  pauseVerb: string;

  // Overlays (Paused / Revive / GameOver)
  pausedTitle: string;
  pausedDesc: string;
  backToMainMenu: string;
  overflowedSuffix: string;
  reviveScorePrefix: string;
  reviveOuterDesc: string;
  reviveAdBtn: string;
  reviveCoinsBtnPrefix: string;
  reviveBalanceLabel: string;
  skipReviveBtn: string;
  newRecordBadge: string;
  gameOverUpper: string;
  prevBestBeatPrefix: string;
  prevBestBeatSuffix: string;
  firstRecordSaved: string;
  modeRecordPrefix: string;
  maxComboLabel: string;
  clearedBlocksLabel: string;
  earnedCoinsLabel: string;
  savingScore: string;
  scoreSavedBoard: string;
  rankSuffix: string;
  scoreSavedLocalTitle: string;
  scoreSavedLocalDesc: string;
  scoreUnverifiedTitle: string;
  scoreUnverifiedDesc: string;
  playAgainBtn: string;
  scoreCopiedBtn: string;
  shareScoreBtn: string;
  mainMenuBtn: string;

  // Modal Titles
  modalHelp: string;
  modalShop: string;
  modalRewards: string;
  modalLeaderboard: string;
  modalAccountPrivacy: string;
  modalMyAccount: string;
  modalAccount: string;
  modalSettings: string;
  modalInstall: string;
  closeBtn: string;

  // Help Modal
  helpBasicsTitle: string;
  helpBasicsBodyBeforeStrong: string;
  helpBasicsBodyStrong: string;
  helpBasicsBodyAfterStrong: string;
  helpControlsTitle: string;
  helpRotatePolygon: string;
  helpMobileTap: string;
  helpFastDrop: string;
  helpMobileSwipe: string;
  helpPauseResume: string;
  helpPowerupsTitle: string;
  helpBombDetail: string;
  helpJokerDetail: string;
  helpFreezeDetail: string;
  helpComboTitle: string;
  helpComboBefore1: string;
  helpComboStrong1: string;
  helpComboMiddle: string;
  helpComboAfter: string;
  helpModesTitle: string;
  helpModeClassicDailyLabel: string;
  helpModeClassicDailyDesc: string;
  helpModeBloomLabel: string;
  helpModeBloomDesc: string;
  helpModeMorphLabel: string;
  helpModeMorphDesc: string;
  helpModePolyLabel: string;
  helpModePolyDesc: string;
  helpMenuGuideTitle: string;
  helpCoinsDesc: string;
  helpRewardsDesc: string;
  helpShopDesc: string;
  helpLeaderboardDesc: string;
  helpAccountDesc: string;
  helpSettingsDesc: string;

  // Account Modal
  guestBannerTitle: string;
  guestBannerDesc: string;
  registerTab: string;
  loginTab: string;
  playerNameField: string;
  playerNamePlaceholder: string;
  emailField: string;
  emailPlaceholder: string;
  passwordFieldRegister: string;
  passwordField: string;
  passwordConfirmField: string;
  processingBtn: string;
  createAccountBtn: string;
  loginBtn: string;
  registeredBadge: string;
  daysUnit: string;
  loginStreakLabel: string;
  unlockedThemesLabel: string;
  changeNamePlaceholder: string;
  savingBtn: string;
  saveBtn: string;
  loggingOutBtn: string;
  logoutBtn: string;
  privacyPolicy: string;
  termsOfUse: string;
  deleteAccountTitle: string;
  deleteAccountDesc: string;
  deleteAccountBtn: string;
  deleteAccountConfirmBtn: string;
  cancelBtn: string;

  // Rewards Modal
  dailyQuestsTab: string;
  sevenDayStreakTab: string;
  coinUnit: string;
  claimedBtn: string;
  claimRewardBtn: string;
  streakIntroDesc: string;
  dayUpperPrefix: string;
  readyExcl: string;
  claimDayRewardPrefix: string;
  claimDayRewardMid: string;
  todayRewardClaimedBtn: string;

  // Shop Modal
  equippedBtn: string;
  equipBtn: string;
  backgroundTitle: string;

  // Leaderboard Modal
  lbGlobal: string;
  lbWeekly: string;
  lbDaily: string;
  playersUnit: string;
  yourRankUpper: string;
  lbEmpty: string;
  lbMaxComboPrefix: string;
  lbBlocksUnit: string;
  lbNoScoreSlot: string;
  lbPlayToRankHint: string;
  youBadge: string;

  // Avatar & Frames Modal
  modalAvatar: string;
  avatarPresetsTitle: string;
  avatarUploadBtn: string;
  avatarUploadingBtn: string;
  avatarResetDefaultBtn: string;
  avatarCustomActive: string;
  avatarUploadHint: string;
  avatarErrInvalidImage: string;
  avatarErrTooLarge: string;
  avatarErrProcessFailed: string;
  avatarFramesTitle: string;
  avatarFramesSoonBadge: string;
  avatarApplyBtn: string;
  changeAvatarAction: string;
  avatarFrameNames: Record<AvatarFrameId, string>;
  avatarPresetNames: Record<PresetAvatarId, string>;

  // Settings Modal
  soundEffectsTitle: string;
  soundEffectsDesc: string;
  soundOn: string;
  soundOff: string;
  settingsAvatarTitle: string;
  settingsAvatarDesc: string;
  guideCardTitle: string;
  guideCardDesc: string;
  openBtn: string;
  installCardTitle: string;
  installCardDesc: string;
  installShortBtn: string;

  // Install Modal
  installPlayLikeApp: string;
  installIntroDesc: string;
  installNowBtn: string;
  iosStep1Title: string;
  iosStep1Before: string;
  iosStep1Strong: string;
  iosStep1After: string;
  iosStep2Title: string;
  iosStep2Before: string;
  iosStep2Mid: string;
  iosStep2Strong: string;
  iosStep2After: string;
  webStep1Title: string;
  webStep1Before: string;
  webStep1Strong: string;
  webStep1After: string;
  webStep2Title: string;
  webStep2Before: string;
  webStep2Strong1: string;
  webStep2Or: string;
  webStep2Strong2: string;
  webStep2After: string;
  offlineCacheReady: string;

  // Banned Overlay
  bannedTitle: string;
  bannedPermDesc: string;
  bannedUntilPrefix: string;
  bannedTempDesc: string;
  bannedDetailHeading: string;
  bannedDefaultReason: string;
  recheckStatusBtn: string;
}

export const TRANSLATIONS: Record<Language, TranslationDict> = {
  tr: {
    siteTitle: 'GYROGON | Çokgen Bulmaca',
    languageLabel: 'Dil',
    languageSelectTitle: 'Uygulama Dili',
    languageSelectDesc: 'Arayüz dilini Türkçe, İngilizce veya Arnavutça olarak değiştir',
    langTooltip: 'Dil Seçimi (TR / EN / SQ)',

    sideBadgeSuffix: 'G',
    polygons: {
      3: 'Üçgen',
      4: 'Kare',
      5: 'Beşgen',
      6: 'Altıgen',
      7: 'Yedigen',
      8: 'Sekizgen'
    },
    layouts: {
      polygon: 'Çokgen',
      bloom: 'Düzlem',
      morph: 'Dinamik'
    },
    powerups: {
      bomb: {
        title: 'Bomba Çubuğu',
        incomingDesc: 'Düştüğü yerde etrafındaki blokları patlatır!',
        activatedDesc: 'Patladı! Etrafındaki bloklar temizlendi.'
      },
      joker: {
        title: 'Joker Çubuğu',
        incomingDesc: 'Değdiği komşunun rengini alır, 3’lüyü tamamlar!',
        activatedDesc: 'Komşu renge dönüştü!'
      },
      freeze: {
        title: 'Dondurma',
        incomingDesc: '4 saniye boyunca gelen tüm blokları yavaşlatır!',
        activatedDesc: 'Aktif! Bloklar 4 saniye yavaşlatıldı.'
      }
    },
    themes: {
      cyberpunk: {
        badge: 'Tema 1 · Varsayılan',
        name: 'Cyberpunk Neon',
        subtitle: 'Yüksek kontrastlı koyu neon altıgen çekirdeği'
      },
      classic: {
        badge: 'Tema 2',
        name: 'Açık Klasik',
        subtitle: 'Minimalist açık gri zemin & düz (flat) blok tasarımı'
      },
      synthwave: {
        badge: 'Tema 3',
        name: 'Synthwave Sunset',
        subtitle: '80s retro gün batımı mor & magenta tonları'
      },
      monochrome: {
        badge: 'Tema 4',
        name: 'Solar Contrast',
        subtitle: 'Ultra net turnuva görüşü için yüksek kontrast'
      },
      matrix: {
        badge: 'Tema 5',
        name: 'Matrix Overdrive',
        subtitle: 'Siber terminal yeşil & fosfor paleti'
      }
    },
    quests: {
      'q-blocks': '30 Blok Patlat',
      'q-combo': 'x4 Kombo Yakala',
      'q-score': '1.200 Puana Ulaş'
    },

    errNameShort: 'Lütfen en az 2 karakterli bir oyuncu adı gir.',
    errEmailInvalid: 'Lütfen geçerli bir e-posta adresi gir.',
    errPasswordShort: 'Şifre en az 6 karakter olmalıdır.',
    errPasswordMismatch: 'Şifreler birbiriyle eşleşmiyor.',
    msgAccountCreated: 'Hesabın oluşturuldu! Tüm skorların ve coinlerin hesabına kaydedildi.',
    msgLoginMerged: 'Giriş yapıldı! Mevcut ilerlemen ve coinlerin hesabınla birleştirildi.',
    msgLoginSynced: 'Giriş yapıldı! Hesap verilerin eşitlendi.',
    msgNameUpdated: 'Oyuncu adın güncellendi.',
    errNameUpdateFailed: 'Oyuncu adı güncellenemedi. Lütfen tekrar dene.',
    msgLoggedOut: 'Hesaptan çıkış yapıldı.',
    accountProfileTab: 'Profil',
    msgAvatarUpdated: 'Avatarın güncellendi.',
    forgotPasswordLink: 'Şifremi Unuttum',
    resetPasswordTitle: 'Şifre Sıfırlama',
    resetPasswordIntro: 'Kayıtlı e-posta adresini yaz, sana 6 haneli tek kullanımlık doğrulama kodu gönderelim.',
    sendResetCodeBtn: 'Doğrulama Kodu Gönder',
    resetCodeField: 'Doğrulama Kodu (6 Hane)',
    resetCodePlaceholder: '000000',
    newPasswordField: 'Yeni Şifre (En Az 6 Karakter)',
    confirmNewPasswordField: 'Yeni Şifre Tekrar',
    resetPasswordSubmitBtn: 'Şifreyi Güncelle ve Giriş Yap',
    resendCodeBtn: 'Kodu Tekrar Gönder',
    backToLoginBtn: 'Giriş Ekranına Dön',
    errResetCodeInvalid: 'Lütfen 6 haneli doğrulama kodunu eksiksiz gir.',
    msgResetCodeSent: 'Bu e-posta adresine kayıtlı bir hesap varsa 6 haneli doğrulama kodu gönderildi.',
    msgResetDevCodeNotice: 'Yerel geliştirme testi için doğrulama kodu:',
    msgPasswordResetSuccess: 'Şifren başarıyla güncellendi ve hesabına giriş yapıldı!',

    shareTitle: 'GYROGON Skorum',
    shareDailyMode: 'Günlük Bulmaca',
    shareClassicMode: 'Klasik',
    shareScoreWord: 'skorum:',
    sharePointsExcl: 'puan!',
    shareMaxComboPrefix: 'Max Kombo',
    shareCta: 'Sen de oyna:',

    powerupIncoming: 'GELİYOR',
    powerupActive: 'AKTİF',

    statsTitle: 'Oyun İstatistiklerim',
    statsLoadingShort: 'Yükleniyor...',
    statsJoinedPrefix: 'Katılım:',
    statsGamesLabel: 'Oynanan Oyun',
    statsClearedLabel: 'Patlatılan Çubuk',
    statsClearedSub: 'Toplam temizlenen',
    statsBestScoreLabel: 'En Yüksek Skor',
    statsBestComboLabel: 'En Yüksek Kombo',
    statsBestComboSub: 'Tek oyunda en iyi',
    statsTotalScoreLabel: 'Toplam Skor',
    statsAllGamesSub: 'Tüm oyunlar',
    statsAvgScoreLabel: 'Ortalama Skor',
    statsAvgSub: 'Oyun başı puan',
    statsCoinEarningsLabel: 'Oyun Coin Kazancı',
    statsMatchCoinsSub: 'Maçlardan kazanılan',
    statsQuestsDoneLabel: 'Tamamlanan Görev',
    statsQuestsDoneSub: 'Ödülü alınan görev',
    statsPolyRecordsHeader: 'ÇOKGEN BAZLI REKORLAR (3G – 8G)',
    statsFavoritePrefix: 'Favori:',
    statsSideSuffix: 'Kenar',
    statsGameUnit: 'oyun',
    statsRecentHeader: 'SON OYUNLAR',
    statsPointsUnit: 'puan',
    statsBlocksUnit: 'çubuk',
    statsEmptyLong: 'Henüz tamamlanmış oyunun yok. İlk oyununu bitirdiğinde tüm istatistiklerin burada görünecek!',

    recordUpper: 'REKOR',
    comboUpper: 'KOMBO',
    morphToBloom: 'Düzleme Geçiliyor!',
    morphToPolygon: 'Çokgene Dönülüyor!',
    dangerAlert: 'TEHLİKE!',
    offlineShort: 'Çevrimdışı',
    queuedSuffix: 'kuyrukta',
    coinsBalanceArenaAria: 'GyroCoins Bakiyesi ve Tema Mağazası',
    settingsAndHelpAria: 'Ayarlar ve Yardım',
    rewards: 'Ödüller',
    rewardsAria: 'Ödüller (Görevler ve Giriş Serisi)',
    shop: 'Mağaza',
    shopAria: 'Tema Mağazası',
    leaderboard: 'Sıralama',
    leaderboardAria: 'Liderlik Tablosu',
    coinsTooltip: 'GyroCoins Bakiyesi · Mağazaya Git',
    coinsBalanceAria: 'GyroCoins Bakiyesi',
    accountGuestTooltip: 'Giriş Yap veya Kayıt Ol',
    accountMyTooltip: 'Hesabım',
    guestAuthBtn: 'Giriş / Kayıt',
    settingsTooltip: 'Ayarlar, Dil & Yardım',

    resumeWithKey: 'Devam Et (P)',
    pauseWithKey: 'Duraklat (P)',
    resumeGame: 'Devam Et',
    pauseGame: 'Duraklat',
    restartGame: 'Yeniden Başlat',
    soundOffTooltip: 'Sesi Aç',
    soundOnTooltip: 'Sesi Kapat',

    dailyPuzzleTitle: 'Günlük Bulmaca',
    todayWord: 'Bugün',
    dailySameOrderSub: 'Herkesle aynı blok sırası',
    menuBloomSub: 'Düzlem Modu · Sütunları sağa-sola kaydır, 3+ bloğu patlat',
    menuMorphSub: 'Dinamik Mod · Oyun içinde Çokgen ve Düzlem arasında geçiş yapar',
    menuClassicSub: 'Aynı renkten 3+ bloğu birleştir ve patlat',
    preparingBtn: 'Hazırlanıyor...',
    playUpperBtn: 'OYNA',
    modeClassicTooltip: 'Her oyunda rastgele yeni blok sırası',
    modeDailyTooltip: 'Bugün tüm oyuncularla aynı blok sırası',
    classicShort: 'Klasik',
    dailyShort: 'Günlük',
    layoutPolygonTooltip: 'Klasik kapalı çokgen modu',
    layoutBloomTooltip: 'Çokgen açılır · Yatay sütun düzlemi',
    layoutMorphTooltip: 'Oyun içinde Çokgen ve Düzlem arasında dinamik geçiş yapar',
    navCategoriesAria: 'Ana menü kategorileri',
    playShort: 'Oyna',
    account: 'Hesap',

    leftMobileBtn: '◀ Sola',
    fastMobileBtn: '▼ Hızlı',
    rightMobileBtn: 'Sağa ▶',
    orWord: 'veya',
    shiftVerb: 'Kaydır',
    rotateOrShiftVerb: 'Döndür / Kaydır',
    rotateVerb: 'Döndür',
    speedUpVerb: 'Hızlandır',
    pauseVerb: 'Duraklat',

    pausedTitle: 'Oyun Duraklatıldı',
    pausedDesc: 'Devam etmek için aşağıdaki butona bas veya P tuşunu kullan.',
    backToMainMenu: 'Ana Menüye Dön',
    overflowedSuffix: 'TAŞTI!',
    reviveScorePrefix: 'Skorun:',
    reviveOuterDesc: 'Dış 3 sırayı patlatıp rekoruna devam et!',
    reviveAdBtn: 'Ödüllü Video ile Canlan',
    reviveCoinsBtnPrefix: '50 GyroCoin ile Canlan',
    reviveBalanceLabel: 'Bakiye:',
    skipReviveBtn: 'Hayır, Skoru Kaydet',
    newRecordBadge: '★ YENİ REKOR!',
    gameOverUpper: 'OYUN BİTTİ',
    prevBestBeatPrefix: 'Önceki rekorunu (',
    prevBestBeatSuffix: ') geçtin!',
    firstRecordSaved: 'Bu moddaki ilk rekorun kaydedildi!',
    modeRecordPrefix: 'Bu moddaki rekorun:',
    maxComboLabel: 'En Yüksek Kombo',
    clearedBlocksLabel: 'Patlatılan Blok',
    earnedCoinsLabel: 'Kazanılan Coin',
    savingScore: 'Skor kaydediliyor...',
    scoreSavedBoard: 'Skor Liderlik Tablosuna Kaydedildi',
    rankSuffix: '. Sıra',
    scoreSavedLocalTitle: 'Skorun Cihazına Kaydedildi',
    scoreSavedLocalDesc: 'Sunucu bağlantısı veya oturum yenilendiği için skor yerel olarak saklandı.',
    scoreUnverifiedTitle: 'Sıralamaya Eklenemedi',
    scoreUnverifiedDesc: 'Oyun sürümü güncellendiği veya oturum eşleşmediği için skor doğrulanamadı.',
    playAgainBtn: 'Tekrar Oyna',
    scoreCopiedBtn: 'Skor Kopyalandı ✓',
    shareScoreBtn: 'Skoru Paylaş',
    mainMenuBtn: 'Ana Menü',

    modalHelp: 'Nasıl Oynanır & Oyun Rehberi',
    modalShop: 'Tema Mağazası',
    modalRewards: 'Günlük Ödüller',
    modalLeaderboard: 'Liderlik Tablosu',
    modalAccountPrivacy: 'Hesap & Gizlilik',
    modalMyAccount: 'Hesabım',
    modalAccount: 'Hesap',
    modalSettings: 'Ayarlar & Yardım',
    modalInstall: 'Uygulamayı Yükle',
    closeBtn: 'Kapat',

    helpBasicsTitle: 'Oyunun Amacı',
    helpBasicsBodyBeforeStrong: 'Merkezdeki çokgeni sağa veya sola döndürerek dışarıdan gelen renkli çubukları uygun kenarlara yerleştir. Aynı renkten ',
    helpBasicsBodyStrong: 'en az 3 çubuğu',
    helpBasicsBodyAfterStrong: ' yan yana veya üst üste birleştirdiğinde patlar ve puan kazanırsın. Herhangi bir kenardaki yığın dış çerçeveyi aşarsa oyun biter.',
    helpControlsTitle: 'Kontroller',
    helpRotatePolygon: 'Çokgeni Döndür',
    helpMobileTap: 'Mobil: Sol / Sağ Tık',
    helpFastDrop: 'Hızlı İndir',
    helpMobileSwipe: 'Mobil: Aşağı Kaydır',
    helpPauseResume: 'Duraklat / Devam',
    helpPowerupsTitle: 'Özel Güç Çubukları (Power-Up)',
    helpBombDetail: 'Yere oturduğunda etrafındaki komşu blokları anında patlatarak sıkışan kenarları açar.',
    helpJokerDetail: "Temas ettiği komşu rengin yerine geçerek eksik 3'lü eşleşmeyi tamamlar.",
    helpFreezeDetail: '4 saniye boyunca gelen tüm çubukları yavaşlatır, zorlu dalgalarda nefes almanı sağlar.',
    helpComboTitle: 'Kombo & Zincir Patlatma',
    helpComboBefore1: 'Dış çokgenin kenarında eriyen renkli çizgi ',
    helpComboStrong1: 'kombo süreni',
    helpComboMiddle: ' gösterir. Süre dolmadan yeni bir patlatma yaptığında veya üstteki bloklar düşüp zincirleme (kaskad) eşleşme oluşturduğunda kombo çarpanı (',
    helpComboAfter: ') artar ve skorun katlanır.',
    helpModesTitle: 'Oyun Modları, Düzlem & Çokgenler (3–8)',
    helpModeClassicDailyLabel: 'Klasik & Günlük:',
    helpModeClassicDailyDesc: 'Klasik her oyunda rastgele blok üretir; Günlük modda o gün herkes aynı blok sırasıyla yarışır.',
    helpModeBloomLabel: 'Düzlem Modu:',
    helpModeBloomDesc: 'Çokgen açılarak yatay sütun düzlemine dönüşür. Sütunları döngüsel olarak sağa-sola kaydırarak yukarıdan düşen blokları eşleştirirsin.',
    helpModeMorphLabel: 'Dinamik Mod:',
    helpModeMorphDesc: 'Çokgen olarak başlar; dalgalarda ve yüksek kombolarda Düzlem moduna geçer, sonra tekrar çokgene döner.',
    helpModePolyLabel: '3–8 Çokgen Seçici:',
    helpModePolyDesc: 'Üçgen, Kare, Beşgen, Altıgen, Yedigen ve Sekizgen — hepsi tüm modlarla uyumludur.',
    helpMenuGuideTitle: 'Menüdeki Butonlar Ne İşe Yarar?',
    helpCoinsDesc: 'Oyun ve görevlerden kazanılır; tema açmak veya canlanmak için kullanılır.',
    helpRewardsDesc: 'Günlük görevleri ve 7 günlük giriş serisi ödüllerini tek yerden toplarsın.',
    helpShopDesc: 'Neon ve Açık Klasik gibi görsel temaları açıp değiştirmeni sağlar.',
    helpLeaderboardDesc: 'Tüm zamanlar, haftalık ve günlük sıralamaları 3–8 kenar bazında gösterir.',
    helpAccountDesc: 'E-posta ile kayıt olarak skorlarını korur, oyuncu adını düzenler ve cihazlar arasında devam edersin.',
    helpSettingsDesc: 'Ses efektlerini ve uygulama dilini yönetir, oyun rehberine ve yükleme seçeneğine ulaşırsın.',

    guestBannerTitle: 'Misafir olarak oynuyorsun',
    guestBannerDesc: 'Skorların ve coinlerin yalnızca bu tarayıcıda tutulur. Hesap oluşturarak ilerlemeni güvenceye alabilirsin.',
    registerTab: 'Kayıt Ol',
    loginTab: 'Giriş Yap',
    playerNameField: 'OYUNCU ADI (LİDERLİK TABLOSUNDA GÖRÜNÜR)',
    playerNamePlaceholder: 'Örn: HızlıPilot',
    emailField: 'E-POSTA ADRESİ',
    emailPlaceholder: 'ornek@eposta.com',
    passwordFieldRegister: 'ŞİFRE (EN AZ 6 KARAKTER)',
    passwordField: 'ŞİFRE',
    passwordConfirmField: 'ŞİFRE TEKRAR',
    processingBtn: 'İşleniyor...',
    createAccountBtn: 'Hesap Oluştur',
    loginBtn: 'Giriş Yap',
    registeredBadge: '✓ Kayıtlı',
    daysUnit: 'Gün',
    loginStreakLabel: 'Giriş Serisi',
    unlockedThemesLabel: 'Açık Tema',
    changeNamePlaceholder: 'Oyuncu adını yaz',
    savingBtn: 'Kaydediliyor...',
    saveBtn: 'Kaydet',
    loggingOutBtn: 'Çıkış Yapılıyor...',
    logoutBtn: 'Çıkış Yap',
    privacyPolicy: 'Gizlilik Politikası (KVKK / GDPR)',
    termsOfUse: 'Kullanım Koşulları',
    deleteAccountTitle: 'Hesap ve Veri Silme (KVKK / GDPR)',
    deleteAccountDesc: 'Bu işlem tüm skorlarını, liderlik kaydını, temalarını ve e-posta kaydını kalıcı olarak siler.',
    deleteAccountBtn: 'Hesabımı ve Tüm Verilerimi Sil',
    deleteAccountConfirmBtn: 'Evet, Kalıcı Olarak Sil',
    cancelBtn: 'Vazgeç',

    dailyQuestsTab: 'Günlük Görevler',
    sevenDayStreakTab: '7 Günlük Seri',
    coinUnit: 'Coin',
    claimedBtn: 'Alındı',
    claimRewardBtn: 'Ödülü Al',
    streakIntroDesc: 'Her gün oyuna girerek artan GyroCoin ödüllerini topla! 7. günde büyük bonus seni bekliyor.',
    dayUpperPrefix: 'GÜN',
    readyExcl: 'Hazır!',
    claimDayRewardPrefix: 'Gün',
    claimDayRewardMid: 'Ödülünü Al',
    todayRewardClaimedBtn: 'Bugünün Ödülü Alındı ✓',

    equippedBtn: 'Seçili',
    equipBtn: 'Kullan',
    backgroundTitle: 'Zemin',

    lbGlobal: 'Global',
    lbWeekly: 'Haftalık',
    lbDaily: 'Günlük',
    playersUnit: 'oyuncu',
    yourRankUpper: 'SENİN SIRAN',
    lbEmpty: 'Henüz kayıtlı skor yok.',
    lbMaxComboPrefix: 'Max Kombo',
    lbBlocksUnit: 'Blok',
    lbNoScoreSlot: 'Henüz Boş',
    lbPlayToRankHint: 'Sıralamaya girmek için bir oyun tamamla',
    youBadge: 'Sen',

    modalAvatar: 'Avatar & Çerçeve',
    avatarPresetsTitle: 'Hazır Avatarlar',
    avatarUploadBtn: 'Fotoğraf Yükle',
    avatarUploadingBtn: 'Hazırlanıyor...',
    avatarResetDefaultBtn: 'Varsayılana Dön',
    avatarCustomActive: 'Özel Fotoğraf',
    avatarUploadHint: 'Otomatik kare kırpılır · PNG, JPG, WEBP',
    avatarErrInvalidImage: 'Lütfen geçerli bir görsel dosyası seç.',
    avatarErrTooLarge: 'Görsel çok büyük. Daha küçük bir fotoğraf dene.',
    avatarErrProcessFailed: 'Görsel işlenemedi. Lütfen tekrar dene.',
    avatarFramesTitle: 'Avatar Çerçeveleri',
    avatarFramesSoonBadge: 'Ödüllerle yakında',
    avatarApplyBtn: 'Uygula & Kaydet',
    changeAvatarAction: 'Avatar Seç',
    avatarFrameNames: {
      default: 'Standart',
      'neon-cyan': 'Neon Siber',
      'solar-gold': 'Altın Şampiyon',
      'emerald-aura': 'Zümrüt Aura',
      'crimson-vip': 'Kızıl VIP',
      'royal-prism': 'Prizma Kraliyet'
    },
    avatarPresetNames: {
      'preset:pilot': 'GyroPilot',
      'preset:capybara': 'Kapibara',
      'preset:cloud': 'Fırtına Bulutu',
      'preset:fox': 'Siber Tilki',
      'preset:cat': 'Neon Kedi',
      'preset:unicorn': 'Tekboynuz',
      'preset:owl': 'Bilge Baykuş',
      'preset:panda': 'Panda',
      'preset:dragon': 'Zümrüt Ejder',
      'preset:bot': 'Astro Bot'
    },

    soundEffectsTitle: 'Ses Efektleri',
    soundEffectsDesc: 'Oyun içi vuruş, kombo ve güç sesleri',
    soundOn: 'Açık',
    soundOff: 'Kapalı',
    settingsAvatarTitle: 'Avatar & Çerçeve',
    settingsAvatarDesc: 'Hazır avatar seç, fotoğraf yükle veya çerçeve önizle',
    guideCardTitle: 'Nasıl Oynanır & Oyun Rehberi',
    guideCardDesc: 'Kurallar, özel güçler, kombo ve ipuçları',
    openBtn: 'Aç',
    installCardTitle: 'Uygulamayı Yükle',
    installCardDesc: 'Ana ekrana kur, tam ekran ve çevrimdışı oyna',
    installShortBtn: 'Kur',

    installPlayLikeApp: 'Uygulama Gibi Oyna',
    installIntroDesc: "GYROGON'u ana ekranına veya masaüstüne kurarak adres çubuğu olmadan tam ekran ve çevrimdışı oynayabilirsin.",
    installNowBtn: 'Hemen Yükle',
    iosStep1Title: 'Paylaş butonuna dokun',
    iosStep1Before: 'Safari alt veya üst çubuğundaki ',
    iosStep1Strong: 'Paylaş',
    iosStep1After: ' simgesine dokun.',
    iosStep2Title: 'Ana Ekrana Ekle',
    iosStep2Before: 'Açılan listeden ',
    iosStep2Mid: ' seçeneğine dokun ve sağ üstten ',
    iosStep2Strong: 'Ekle',
    iosStep2After: "'yi onayla.",
    webStep1Title: 'Tarayıcı Menüsünü veya Yükle Simgesini Aç',
    webStep1Before: 'Adres çubuğunun sağındaki ',
    webStep1Strong: 'Yükle',
    webStep1After: ' ikonuna ya da tarayıcı menüsüne tıkla.',
    webStep2Title: 'Uygulamayı Kur',
    webStep2Before: '',
    webStep2Strong1: 'GYROGON Uygulamasını Yükle',
    webStep2Or: ' veya ',
    webStep2Strong2: 'Ana Ekrana Ekle',
    webStep2After: ' seçeneğini onayla.',
    offlineCacheReady: 'Çevrimdışı kullanım için önbellek hazır',

    bannedTitle: 'Hesabın Yasaklandı',
    bannedPermDesc: 'Bu hesaba kalıcı erişim kısıtlaması uygulandı.',
    bannedUntilPrefix: 'Yasak bitiş tarihi:',
    bannedTempDesc: 'Geçici erişim kısıtlaması uygulandı.',
    bannedDetailHeading: 'Yasaklama Detayı',
    bannedDefaultReason: 'Oyun kurallarına aykırı davranış nedeniyle hesap geçici veya kalıcı olarak kısıtlandı.',
    recheckStatusBtn: 'Durumu Yeniden Kontrol Et'
  },

  en: {
    siteTitle: 'GYROGON | Polygon Puzzle',
    languageLabel: 'Language',
    languageSelectTitle: 'App Language',
    languageSelectDesc: 'Switch interface language between Turkish, English, or Albanian',
    langTooltip: 'Language (TR / EN / SQ)',

    sideBadgeSuffix: 'S',
    polygons: {
      3: 'Triangle',
      4: 'Square',
      5: 'Pentagon',
      6: 'Hexagon',
      7: 'Heptagon',
      8: 'Octagon'
    },
    layouts: {
      polygon: 'Polygon',
      bloom: 'Flat Strip',
      morph: 'Dynamic'
    },
    powerups: {
      bomb: {
        title: 'Bomb Bar',
        incomingDesc: 'Blasts nearby blocks right where it lands!',
        activatedDesc: 'Boom! Surrounding blocks cleared.'
      },
      joker: {
        title: 'Wild Bar',
        incomingDesc: 'Copies a touching neighbor’s color to complete a match of 3!',
        activatedDesc: 'Transformed into neighbor’s color!'
      },
      freeze: {
        title: 'Freeze',
        incomingDesc: 'Slows down all incoming blocks for 4 seconds!',
        activatedDesc: 'Active! Incoming blocks slowed for 4s.'
      }
    },
    themes: {
      cyberpunk: {
        badge: 'Theme 1 · Default',
        name: 'Cyberpunk Neon',
        subtitle: 'High-contrast dark neon polygon core'
      },
      classic: {
        badge: 'Theme 2',
        name: 'Light Classic',
        subtitle: 'Minimalist light gray canvas & crisp flat blocks'
      },
      synthwave: {
        badge: 'Theme 3',
        name: 'Synthwave Sunset',
        subtitle: '80s retro sunset purple & magenta palette'
      },
      monochrome: {
        badge: 'Theme 4',
        name: 'Solar Contrast',
        subtitle: 'Ultra-crisp high-contrast tournament visibility'
      },
      matrix: {
        badge: 'Theme 5',
        name: 'Matrix Overdrive',
        subtitle: 'Cyber terminal green & phosphor palette'
      }
    },
    quests: {
      'q-blocks': 'Clear 30 Blocks',
      'q-combo': 'Hit a x4 Combo',
      'q-score': 'Reach 1,200 Points'
    },

    errNameShort: 'Please enter a player name of at least 2 characters.',
    errEmailInvalid: 'Please enter a valid email address.',
    errPasswordShort: 'Password must be at least 6 characters.',
    errPasswordMismatch: 'Passwords do not match.',
    msgAccountCreated: 'Account created! All your scores and coins are saved to your profile.',
    msgLoginMerged: 'Signed in! Your local progress and coins have been merged.',
    msgLoginSynced: 'Signed in! Your account data is synced.',
    msgNameUpdated: 'Your player name has been updated.',
    errNameUpdateFailed: 'Could not update player name. Please try again.',
    msgLoggedOut: 'Signed out of account.',
    accountProfileTab: 'Profile',
    msgAvatarUpdated: 'Your avatar has been updated.',
    forgotPasswordLink: 'Forgot Password?',
    resetPasswordTitle: 'Reset Password',
    resetPasswordIntro: 'Enter your registered email address and we will send you a 6-digit verification code.',
    sendResetCodeBtn: 'Send Verification Code',
    resetCodeField: 'Verification Code (6 Digits)',
    resetCodePlaceholder: '000000',
    newPasswordField: 'New Password (Min. 6 Characters)',
    confirmNewPasswordField: 'Confirm New Password',
    resetPasswordSubmitBtn: 'Update Password & Sign In',
    resendCodeBtn: 'Resend Code',
    backToLoginBtn: 'Back to Sign In',
    errResetCodeInvalid: 'Please enter the full 6-digit verification code.',
    msgResetCodeSent: 'If an account matches this email address, a 6-digit verification code has been sent.',
    msgResetDevCodeNotice: 'Local development test verification code:',
    msgPasswordResetSuccess: 'Your password has been updated and you are signed in!',

    shareTitle: 'My GYROGON Score',
    shareDailyMode: 'Daily Challenge',
    shareClassicMode: 'Classic',
    shareScoreWord: 'score:',
    sharePointsExcl: 'pts!',
    shareMaxComboPrefix: 'Max Combo',
    shareCta: 'Play now:',

    powerupIncoming: 'INCOMING',
    powerupActive: 'ACTIVE',

    statsTitle: 'My Game Stats',
    statsLoadingShort: 'Loading...',
    statsJoinedPrefix: 'Joined:',
    statsGamesLabel: 'Games Played',
    statsClearedLabel: 'Blocks Cleared',
    statsClearedSub: 'Total cleared',
    statsBestScoreLabel: 'High Score',
    statsBestComboLabel: 'Best Combo',
    statsBestComboSub: 'Best in a single run',
    statsTotalScoreLabel: 'Total Score',
    statsAllGamesSub: 'All matches',
    statsAvgScoreLabel: 'Average Score',
    statsAvgSub: 'Points per match',
    statsCoinEarningsLabel: 'Match Coin Earnings',
    statsMatchCoinsSub: 'Earned from matches',
    statsQuestsDoneLabel: 'Quests Completed',
    statsQuestsDoneSub: 'Claimed rewards',
    statsPolyRecordsHeader: 'RECORDS BY POLYGON (3S – 8S)',
    statsFavoritePrefix: 'Favorite:',
    statsSideSuffix: 'Sides',
    statsGameUnit: 'games',
    statsRecentHeader: 'RECENT GAMES',
    statsPointsUnit: 'pts',
    statsBlocksUnit: 'blocks',
    statsEmptyLong: 'No completed games yet. Finish your first match to see all your stats here!',

    recordUpper: 'BEST',
    comboUpper: 'COMBO',
    morphToBloom: 'Opening to Flat Strip!',
    morphToPolygon: 'Closing to Polygon!',
    dangerAlert: 'DANGER!',
    offlineShort: 'Offline',
    queuedSuffix: 'queued',
    coinsBalanceArenaAria: 'GyroCoins Balance & Theme Shop',
    settingsAndHelpAria: 'Settings and Help',
    rewards: 'Rewards',
    rewardsAria: 'Rewards (Quests & Login Streak)',
    shop: 'Shop',
    shopAria: 'Theme Shop',
    leaderboard: 'Ranks',
    leaderboardAria: 'Leaderboard',
    coinsTooltip: 'GyroCoins Balance · Open Shop',
    coinsBalanceAria: 'GyroCoins Balance',
    accountGuestTooltip: 'Sign In or Sign Up',
    accountMyTooltip: 'My Account',
    guestAuthBtn: 'Sign In / Up',
    settingsTooltip: 'Settings, Language & Help',

    resumeWithKey: 'Resume (P)',
    pauseWithKey: 'Pause (P)',
    resumeGame: 'Resume',
    pauseGame: 'Pause',
    restartGame: 'Restart',
    soundOffTooltip: 'Unmute Audio',
    soundOnTooltip: 'Mute Audio',

    dailyPuzzleTitle: 'Daily Puzzle',
    todayWord: 'Today',
    dailySameOrderSub: 'Same block order for everyone',
    menuBloomSub: 'Flat Strip · Shift columns left or right to match 3+ blocks',
    menuMorphSub: 'Dynamic Mode · Switches smoothly between Polygon and Flat Strip',
    menuClassicSub: 'Match 3+ blocks of the same color to clear',
    preparingBtn: 'Preparing...',
    playUpperBtn: 'PLAY',
    modeClassicTooltip: 'Fresh random block sequence every run',
    modeDailyTooltip: 'Same block sequence for everyone today',
    classicShort: 'Classic',
    dailyShort: 'Daily',
    layoutPolygonTooltip: 'Classic closed polygon board',
    layoutBloomTooltip: 'Unfolds into a horizontal sliding ribbon',
    layoutMorphTooltip: 'Dynamically shifts between Polygon and Flat Strip mid-game',
    navCategoriesAria: 'Main menu sections',
    playShort: 'Play',
    account: 'Account',

    leftMobileBtn: '◀ Left',
    fastMobileBtn: '▼ Drop',
    rightMobileBtn: 'Right ▶',
    orWord: 'or',
    shiftVerb: 'Shift',
    rotateOrShiftVerb: 'Rotate / Shift',
    rotateVerb: 'Rotate',
    speedUpVerb: 'Fast Drop',
    pauseVerb: 'Pause',

    pausedTitle: 'Game Paused',
    pausedDesc: 'Press the button below or hit P whenever you are ready to continue.',
    backToMainMenu: 'Back to Main Menu',
    overflowedSuffix: 'OVERFLOWED!',
    reviveScorePrefix: 'Score:',
    reviveOuterDesc: 'Blast away the outer 3 rings and keep pushing your high score!',
    reviveAdBtn: 'Watch Rewarded Ad & Revive',
    reviveCoinsBtnPrefix: 'Revive for 50 GyroCoins',
    reviveBalanceLabel: 'Balance:',
    skipReviveBtn: 'No thanks, Save Score',
    newRecordBadge: '★ NEW RECORD!',
    gameOverUpper: 'GAME OVER',
    prevBestBeatPrefix: 'You beat your previous record (',
    prevBestBeatSuffix: ')!',
    firstRecordSaved: 'Your first record for this mode is saved!',
    modeRecordPrefix: 'Best in this mode:',
    maxComboLabel: 'Max Combo',
    clearedBlocksLabel: 'Blocks Cleared',
    earnedCoinsLabel: 'Coins Earned',
    savingScore: 'Saving score...',
    scoreSavedBoard: 'Score Saved to Leaderboard',
    rankSuffix: ' Rank',
    scoreSavedLocalTitle: 'Score Saved Locally',
    scoreSavedLocalDesc: 'Stored on your device because connection or session refreshed.',
    scoreUnverifiedTitle: 'Could Not Join Leaderboard',
    scoreUnverifiedDesc: 'Score could not be verified due to an app update or session mismatch.',
    playAgainBtn: 'Play Again',
    scoreCopiedBtn: 'Copied ✓',
    shareScoreBtn: 'Share Score',
    mainMenuBtn: 'Main Menu',

    modalHelp: 'How to Play & Guide',
    modalShop: 'Theme Shop',
    modalRewards: 'Daily Rewards',
    modalLeaderboard: 'Leaderboard',
    modalAccountPrivacy: 'Account & Privacy',
    modalMyAccount: 'My Account',
    modalAccount: 'Account',
    modalSettings: 'Settings & Help',
    modalInstall: 'Install App',
    closeBtn: 'Close',

    helpBasicsTitle: 'Objective',
    helpBasicsBodyBeforeStrong: 'Rotate the central polygon left or right to catch incoming colored bars on matching sides. Connect ',
    helpBasicsBodyStrong: '3 or more bars',
    helpBasicsBodyAfterStrong: ' of the same color side-by-side or stacked to blast them away and score points. Game ends if any stack exceeds the outer frame.',
    helpControlsTitle: 'Controls',
    helpRotatePolygon: 'Rotate Polygon',
    helpMobileTap: 'Mobile: Tap Left / Right',
    helpFastDrop: 'Fast Drop',
    helpMobileSwipe: 'Mobile: Swipe Down',
    helpPauseResume: 'Pause / Resume',
    helpPowerupsTitle: 'Special Power-Up Bars',
    helpBombDetail: 'Explodes immediately on landing, clearing neighboring blocks to relieve tight sides.',
    helpJokerDetail: 'Adopts the color of a touching neighbor to complete a match of 3.',
    helpFreezeDetail: 'Slows all incoming bars for 4 seconds, giving you room to recover in intense waves.',
    helpComboTitle: 'Combos & Chain Blasts',
    helpComboBefore1: 'The shrinking colored bar along the outer frame shows your ',
    helpComboStrong1: 'combo timer',
    helpComboMiddle: '. Scoring another match before it runs out—or triggering cascading falls—raises your multiplier (',
    helpComboAfter: ').',
    helpModesTitle: 'Modes, Layouts & Polygons (3–8)',
    helpModeClassicDailyLabel: 'Classic & Daily:',
    helpModeClassicDailyDesc: 'Classic generates fresh blocks every run; Daily gives everyone the exact same sequence for the day.',
    helpModeBloomLabel: 'Flat Strip:',
    helpModeBloomDesc: 'The polygon unfolds into horizontal columns. Slide columns cyclically left and right to match falling bars.',
    helpModeMorphLabel: 'Dynamic Mode:',
    helpModeMorphDesc: 'Starts as a polygon and shifts smoothly into Flat Strip during waves and high combos, then folds back.',
    helpModePolyLabel: '3–8 Polygons:',
    helpModePolyDesc: 'Triangle, Square, Pentagon, Hexagon, Heptagon, and Octagon — all compatible with every mode.',
    helpMenuGuideTitle: 'Menu Shortcuts',
    helpCoinsDesc: 'Earned from matches and quests; spend on visual themes or revives.',
    helpRewardsDesc: 'Track daily quests and claim your 7-day login streak bonuses in one place.',
    helpShopDesc: 'Unlock and switch between dark neon and light classic visual themes.',
    helpLeaderboardDesc: 'View all-time, weekly, and daily rankings filtered by 3–8 polygon sides.',
    helpAccountDesc: 'Register with email to protect scores, edit your pilot name, and sync across devices.',
    helpSettingsDesc: 'Manage audio effects, switch app language, open the guide, or install the app.',

    guestBannerTitle: 'Playing as a Guest',
    guestBannerDesc: 'Your scores and coins are only kept in this browser. Create an account to save your progress.',
    registerTab: 'Sign Up',
    loginTab: 'Sign In',
    playerNameField: 'PLAYER NAME (SHOWN ON LEADERBOARD)',
    playerNamePlaceholder: 'e.g. SwiftPilot',
    emailField: 'EMAIL ADDRESS',
    emailPlaceholder: 'you@example.com',
    passwordFieldRegister: 'PASSWORD (MIN 6 CHARS)',
    passwordField: 'PASSWORD',
    passwordConfirmField: 'CONFIRM PASSWORD',
    processingBtn: 'Processing...',
    createAccountBtn: 'Create Account',
    loginBtn: 'Sign In',
    registeredBadge: '✓ Verified',
    daysUnit: 'Days',
    loginStreakLabel: 'Login Streak',
    unlockedThemesLabel: 'Themes Unlocked',
    changeNamePlaceholder: 'Enter player name',
    savingBtn: 'Saving...',
    saveBtn: 'Save',
    loggingOutBtn: 'Signing Out...',
    logoutBtn: 'Sign Out',
    privacyPolicy: 'Privacy Policy (GDPR)',
    termsOfUse: 'Terms of Use',
    deleteAccountTitle: 'Account & Data Deletion (GDPR)',
    deleteAccountDesc: 'This permanently deletes all your scores, leaderboard entries, themes, and email record.',
    deleteAccountBtn: 'Delete My Account & All Data',
    deleteAccountConfirmBtn: 'Yes, Permanently Delete',
    cancelBtn: 'Cancel',

    dailyQuestsTab: 'Daily Quests',
    sevenDayStreakTab: '7-Day Streak',
    coinUnit: 'Coins',
    claimedBtn: 'Claimed',
    claimRewardBtn: 'Claim Reward',
    streakIntroDesc: 'Log in every day to collect escalating GyroCoin bonuses! A huge prize awaits on Day 7.',
    dayUpperPrefix: 'DAY',
    readyExcl: 'Ready!',
    claimDayRewardPrefix: 'Claim Day',
    claimDayRewardMid: 'Reward',
    todayRewardClaimedBtn: 'Today’s Reward Claimed ✓',

    equippedBtn: 'Equipped',
    equipBtn: 'Equip',
    backgroundTitle: 'Canvas',

    lbGlobal: 'All-Time',
    lbWeekly: 'Weekly',
    lbDaily: 'Daily',
    playersUnit: 'players',
    yourRankUpper: 'YOUR RANK',
    lbEmpty: 'No scores recorded yet.',
    lbMaxComboPrefix: 'Max Combo',
    lbBlocksUnit: 'Blocks',
    lbNoScoreSlot: 'Open Spot',
    lbPlayToRankHint: 'Finish a run to claim your spot on the board',
    youBadge: 'You',

    modalAvatar: 'Avatar & Frames',
    avatarPresetsTitle: 'Preset Avatars',
    avatarUploadBtn: 'Upload Photo',
    avatarUploadingBtn: 'Processing...',
    avatarResetDefaultBtn: 'Reset Default',
    avatarCustomActive: 'Custom Photo',
    avatarUploadHint: 'Auto-cropped square · PNG, JPG, WEBP',
    avatarErrInvalidImage: 'Please select a valid image file.',
    avatarErrTooLarge: 'Image is too large. Please try a smaller photo.',
    avatarErrProcessFailed: 'Could not process image. Please try again.',
    avatarFramesTitle: 'Avatar Frames',
    avatarFramesSoonBadge: 'Coming in Rewards',
    avatarApplyBtn: 'Save Avatar',
    changeAvatarAction: 'Edit Avatar',
    avatarFrameNames: {
      default: 'Standard',
      'neon-cyan': 'Neon Cyber',
      'solar-gold': 'Solar Gold',
      'emerald-aura': 'Emerald Aura',
      'crimson-vip': 'Crimson VIP',
      'royal-prism': 'Royal Prism'
    },
    avatarPresetNames: {
      'preset:pilot': 'GyroPilot',
      'preset:capybara': 'Capybara',
      'preset:cloud': 'Storm Cloud',
      'preset:fox': 'Cyber Fox',
      'preset:cat': 'Neon Cat',
      'preset:unicorn': 'Unicorn',
      'preset:owl': 'Wise Owl',
      'preset:panda': 'Panda',
      'preset:dragon': 'Emerald Dragon',
      'preset:bot': 'Astro Bot'
    },

    soundEffectsTitle: 'Sound Effects',
    soundEffectsDesc: 'In-game rotation, match, and power-up audio',
    soundOn: 'On',
    soundOff: 'Off',
    settingsAvatarTitle: 'Avatar & Frame',
    settingsAvatarDesc: 'Pick a preset avatar, upload a photo, or preview frames',
    guideCardTitle: 'How to Play & Guide',
    guideCardDesc: 'Rules, special power-ups, combos, and tips',
    openBtn: 'Open',
    installCardTitle: 'Install App',
    installCardDesc: 'Add to home screen for full-screen & offline play',
    installShortBtn: 'Install',

    installPlayLikeApp: 'Play Like a Native App',
    installIntroDesc: 'Install GYROGON on your home screen or desktop for full-screen, offline-ready play with zero browser chrome.',
    installNowBtn: 'Install Now',
    iosStep1Title: 'Tap the Share button',
    iosStep1Before: 'Tap the ',
    iosStep1Strong: 'Share',
    iosStep1After: ' icon on Safari’s bottom or top bar.',
    iosStep2Title: 'Add to Home Screen',
    iosStep2Before: 'Select ',
    iosStep2Mid: ' from the list, then confirm ',
    iosStep2Strong: 'Add',
    iosStep2After: ' in the top right.',
    webStep1Title: 'Open Browser Menu or Install Icon',
    webStep1Before: 'Click the ',
    webStep1Strong: 'Install',
    webStep1After: ' icon in the address bar or open your browser menu.',
    webStep2Title: 'Confirm Installation',
    webStep2Before: 'Choose ',
    webStep2Strong1: 'Install GYROGON',
    webStep2Or: ' or ',
    webStep2Strong2: 'Add to Home Screen',
    webStep2After: ' to finish.',
    offlineCacheReady: 'Offline cache ready',

    bannedTitle: 'Account Restricted',
    bannedPermDesc: 'This account has been permanently restricted.',
    bannedUntilPrefix: 'Restricted until:',
    bannedTempDesc: 'A temporary restriction has been applied.',
    bannedDetailHeading: 'Restriction Details',
    bannedDefaultReason: 'This account was temporarily or permanently restricted due to a rule or security violation.',
    recheckStatusBtn: 'Re-check Status'
  },

  sq: {
    siteTitle: 'GYROGON | Lojë Shumëkëndëshe',
    languageLabel: 'Gjuha',
    languageSelectTitle: 'Gjuha e Aplikacionit',
    languageSelectDesc: 'Ndrysho gjuhën e ndërfaqes në Turqisht, Anglisht ose Shqip',
    langTooltip: 'Zgjidh Gjuhën (TR / EN / SQ)',

    sideBadgeSuffix: 'K',
    polygons: {
      3: 'Trekëndësh',
      4: 'Katror',
      5: 'Pesëkëndësh',
      6: 'Gjashtëkëndësh',
      7: 'Shtatëkëndësh',
      8: 'Tetëkëndësh'
    },
    layouts: {
      polygon: 'Shumëkëndësh',
      bloom: 'Shirit',
      morph: 'Dinamik'
    },
    powerups: {
      bomb: {
        title: 'Shufra Bombë',
        incomingDesc: 'Shpërthen blloqet përreth aty ku bie!',
        activatedDesc: 'Shpërtheu! Blloqet përreth u pastruan.'
      },
      joker: {
        title: 'Shufra Xhoker',
        incomingDesc: 'Merr ngjyrën e fqinjit që prek për të plotësuar treshen!',
        activatedDesc: 'U shndërrua në ngjyrën e fqinjit!'
      },
      freeze: {
        title: 'Ngrirje',
        incomingDesc: 'Ngadalëson të gjitha blloqet në ardhje për 4 sekonda!',
        activatedDesc: 'Aktive! Blloqet u ngadalësuan për 4s.'
      }
    },
    themes: {
      cyberpunk: {
        badge: 'Tema 1 · Parazgjedhur',
        name: 'Cyberpunk Neon',
        subtitle: 'Bërthamë e errët neon me kontrast të lartë'
      },
      classic: {
        badge: 'Tema 2',
        name: 'Klasike e Çelët',
        subtitle: 'Sfond minimalist gri i çelët & blloqe të rrafshëta'
      },
      synthwave: {
        badge: 'Tema 3',
        name: 'Synthwave Sunset',
        subtitle: 'Tone retro vjollcë dhe magjentë të viteve ’80'
      },
      monochrome: {
        badge: 'Tema 4',
        name: 'Solar Contrast',
        subtitle: 'Kontrast ultra i qartë për turne'
      },
      matrix: {
        badge: 'Tema 5',
        name: 'Matrix Overdrive',
        subtitle: 'Paletë jeshile terminali kibernetik'
      }
    },
    quests: {
      'q-blocks': 'Pastro 30 Blloqe',
      'q-combo': 'Arrij Kombo x4',
      'q-score': 'Arrij 1.200 Pikë'
    },

    errNameShort: 'Shkruaj një emër lojtari me të paktën 2 karaktere.',
    errEmailInvalid: 'Ju lutem shkruaj një adresë emaili të vlefshme.',
    errPasswordShort: 'Fjalëkalimi duhet të ketë të paktën 6 karaktere.',
    errPasswordMismatch: 'Fjalëkalimet nuk përputhen.',
    msgAccountCreated: 'Llogaria u krijua! Të gjitha pikët dhe monedhat u ruajtën.',
    msgLoginMerged: 'U fute me sukses! Progresi dhe monedhat ekzistuese u bashkuan.',
    msgLoginSynced: 'U fute me sukses! Të dhënat u sinkronizuan.',
    msgNameUpdated: 'Emri i lojtarit u përditësua.',
    errNameUpdateFailed: 'Emri nuk u përditësua dot. Provo përsëri.',
    msgLoggedOut: 'Dole nga llogaria.',
    accountProfileTab: 'Profili',
    msgAvatarUpdated: 'Avatari yt u përditësua.',
    forgotPasswordLink: 'Ke harruar fjalëkalimin?',
    resetPasswordTitle: 'Rivendos Fjalëkalimin',
    resetPasswordIntro: 'Shkruaj adresën e email-it të regjistruar dhe do të dërgojmë një kod verifikimi 6-shifror.',
    sendResetCodeBtn: 'Dërgo Kodin e Verifikimit',
    resetCodeField: 'Kodi i Verifikimit (6 Shifra)',
    resetCodePlaceholder: '000000',
    newPasswordField: 'Fjalëkalimi i Ri (Min. 6 Karaktere)',
    confirmNewPasswordField: 'Konfirmo Fjalëkalimin e Ri',
    resetPasswordSubmitBtn: 'Përditëso Fjalëkalimin & Hyr',
    resendCodeBtn: 'Ridërgo Kodin',
    backToLoginBtn: 'Kthehu te Hyrja',
    errResetCodeInvalid: 'Të lutem vendos kodin e plotë 6-shifror të verifikimit.',
    msgResetCodeSent: 'Nëse ekziston një llogari me këtë email, një kod 6-shifror verifikimi u dërgua.',
    msgResetDevCodeNotice: 'Kodi i verifikimit për testim lokal:',
    msgPasswordResetSuccess: 'Fjalëkalimi u përditësua dhe hyre në llogarinë tënde!',

    shareTitle: 'Rezultati im në GYROGON',
    shareDailyMode: 'Sfida Ditore',
    shareClassicMode: 'Klasik',
    shareScoreWord: 'rezultati:',
    sharePointsExcl: 'pikë!',
    shareMaxComboPrefix: 'Kombo Maks',
    shareCta: 'Luaj edhe ti:',

    powerupIncoming: 'NË ARDHJE',
    powerupActive: 'AKTIVE',

    statsTitle: 'Statistikat e Mia',
    statsLoadingShort: 'Duke ngarkuar...',
    statsJoinedPrefix: 'Anëtarësuar:',
    statsGamesLabel: 'Lojëra të Luajtura',
    statsClearedLabel: 'Shufra të Pastruara',
    statsClearedSub: 'Gjithsej të pastruara',
    statsBestScoreLabel: 'Rekordi Personal',
    statsBestComboLabel: 'Kombo Më i Mirë',
    statsBestComboSub: 'Më i miri në një lojë',
    statsTotalScoreLabel: 'Pikë Gjithsej',
    statsAllGamesSub: 'Të gjitha lojërat',
    statsAvgScoreLabel: 'Pikë Mesatare',
    statsAvgSub: 'Pikë për lojë',
    statsCoinEarningsLabel: 'Fitimet nga Lojërat',
    statsMatchCoinsSub: 'Fituar nga ndeshjet',
    statsQuestsDoneLabel: 'Detyra të Përfunduara',
    statsQuestsDoneSub: 'Shpërblime të marra',
    statsPolyRecordsHeader: 'REKORDET SIPAS SHUMËKËNDËSHIT (3K – 8K)',
    statsFavoritePrefix: 'Preferuar:',
    statsSideSuffix: 'Brinjë',
    statsGameUnit: 'lojëra',
    statsRecentHeader: 'LOJËRAT E FUNDIT',
    statsPointsUnit: 'pikë',
    statsBlocksUnit: 'shufra',
    statsEmptyLong: 'Ende nuk ke lojëra të përfunduara. Përfundo ndeshjen e parë për të parë statistikat këtu!',

    recordUpper: 'REKORDI',
    comboUpper: 'KOMBO',
    morphToBloom: 'Po hapet në Shirit!',
    morphToPolygon: 'Po kthehet në Shumëkëndësh!',
    dangerAlert: 'RREZIK!',
    offlineShort: 'Offline',
    queuedSuffix: 'në pritje',
    coinsBalanceArenaAria: 'Bilanci GyroCoins dhe Dyqani i Temave',
    settingsAndHelpAria: 'Cilësimet dhe Ndihma',
    rewards: 'Shpërblime',
    rewardsAria: 'Shpërblimet (Detyrat & Seria Ditore)',
    shop: 'Dyqani',
    shopAria: 'Dyqani i Temave',
    leaderboard: 'Renditja',
    leaderboardAria: 'Tabela e Renditjes',
    coinsTooltip: 'Bilanci GyroCoins · Hap Dyqanin',
    coinsBalanceAria: 'Bilanci GyroCoins',
    accountGuestTooltip: 'Hyr ose Regjistrohu',
    accountMyTooltip: 'Llogaria Ime',
    guestAuthBtn: 'Hyr / Regjistrohu',
    settingsTooltip: 'Cilësimet, Gjuha & Ndihma',

    resumeWithKey: 'Vazhdo (P)',
    pauseWithKey: 'Pauzë (P)',
    resumeGame: 'Vazhdo',
    pauseGame: 'Pauzë',
    restartGame: 'Rifillo',
    soundOffTooltip: 'Aktivizo Zërin',
    soundOnTooltip: 'Çaktivizo Zërin',

    dailyPuzzleTitle: 'Sfida Ditore',
    todayWord: 'Sot',
    dailySameOrderSub: 'E njëjta radhë blloqesh për të gjithë',
    menuBloomSub: 'Modaliteti Shirit · Zhvendos kolonat majtas-djathtas, pastro 3+ blloqe',
    menuMorphSub: 'Modaliteti Dinamik · Kalon mes Shumëkëndëshit dhe Shiritit gjatë lojës',
    menuClassicSub: 'Bashko 3+ blloqe me të njëjtën ngjyrë dhe pastroji',
    preparingBtn: 'Duke përgatitur...',
    playUpperBtn: 'LUAJ',
    modeClassicTooltip: 'Radhë e re e rastësishme blloqesh në çdo lojë',
    modeDailyTooltip: 'E njëjta radhë blloqesh për të gjithë lojtarët sot',
    classicShort: 'Klasik',
    dailyShort: 'Ditore',
    layoutPolygonTooltip: 'Fushë klasike me shumëkëndësh të mbyllur',
    layoutBloomTooltip: 'Shumëkëndëshi hapet në shirit horizontal',
    layoutMorphTooltip: 'Kalon dinamikisht mes Shumëkëndëshit dhe Shiritit',
    navCategoriesAria: 'Kategoritë e menusë kryesore',
    playShort: 'Luaj',
    account: 'Llogaria',

    leftMobileBtn: '◀ Majtas',
    fastMobileBtn: '▼ Shpejt',
    rightMobileBtn: 'Djathtas ▶',
    orWord: 'ose',
    shiftVerb: 'Zhvendos',
    rotateOrShiftVerb: 'Rrotullo / Zhvendos',
    rotateVerb: 'Rrotullo',
    speedUpVerb: 'Shpejto',
    pauseVerb: 'Pauzë',

    pausedTitle: 'Loja në Pauzë',
    pausedDesc: 'Shtyp butonin më poshtë ose tastin P kur të jesh gati për të vazhduar.',
    backToMainMenu: 'Kthehu te Menuja',
    overflowedSuffix: 'U MBUSH!',
    reviveScorePrefix: 'Pikët:',
    reviveOuterDesc: 'Pastro 3 unazat e jashtme dhe vazhdo rekordin tënd!',
    reviveAdBtn: 'Shiko Reklamë & Ringjallu',
    reviveCoinsBtnPrefix: 'Vazhdo me 50 GyroCoins',
    reviveBalanceLabel: 'Bilanci:',
    skipReviveBtn: 'Jo, Ruaj Pikët',
    newRecordBadge: '★ REKORD I RI!',
    gameOverUpper: 'LOJA PËRFUNDOI',
    prevBestBeatPrefix: 'Theve rekordin tënd të mëparshëm (',
    prevBestBeatSuffix: ')!',
    firstRecordSaved: 'Rekordi yt i parë për këtë modalitet u ruajt!',
    modeRecordPrefix: 'Rekordi në këtë modalitet:',
    maxComboLabel: 'Kombo Maks',
    clearedBlocksLabel: 'Blloqe të Pastruara',
    earnedCoinsLabel: 'Coin të Fituara',
    savingScore: 'Duke ruajtur pikët...',
    scoreSavedBoard: 'Pikët u ruajtën në Renditje',
    rankSuffix: '. Vend',
    scoreSavedLocalTitle: 'Pikët u ruajtën në pajisje',
    scoreSavedLocalDesc: 'U ruajt lokalisht sepse lidhja ose sesioni u rifreskua.',
    scoreUnverifiedTitle: 'Nuk u shtua në renditje',
    scoreUnverifiedDesc: 'Pikët nuk u verifikuan dot për shkak të përditësimit ose sesionit.',
    playAgainBtn: 'Luaj Përsëri',
    scoreCopiedBtn: 'U kopjua ✓',
    shareScoreBtn: 'Ndaj Pikët',
    mainMenuBtn: 'Menuja Kryesore',

    modalHelp: 'Si të luash & Udhëzuesi',
    modalShop: 'Dyqani i Temave',
    modalRewards: 'Shpërblimet Ditore',
    modalLeaderboard: 'Tabela e Renditjes',
    modalAccountPrivacy: 'Llogaria & Privatësia',
    modalMyAccount: 'Llogaria Ime',
    modalAccount: 'Llogaria',
    modalSettings: 'Cilësimet & Ndihma',
    modalInstall: 'Instalo Aplikacionin',
    closeBtn: 'Mbyll',

    helpBasicsTitle: 'Qëllimi i Lojës',
    helpBasicsBodyBeforeStrong: 'Rrotullo shumëkëndëshin qendror majtas ose djathtas për të kapur shufrat me ngjyra. Kur bashkon ',
    helpBasicsBodyStrong: 'të paktën 3 shufra',
    helpBasicsBodyAfterStrong: ' me të njëjtën ngjyrë pranë ose mbi njëra-tjetrën, ato shpërthejnë dhe fiton pikë. Nëse ndonjë kolonë kalon kornizën e jashtme, loja mbaron.',
    helpControlsTitle: 'Kontrollet',
    helpRotatePolygon: 'Rrotullo Shumëkëndëshin',
    helpMobileTap: 'Celular: Prek Majtas / Djathtas',
    helpFastDrop: 'Rënie e Shpejtë',
    helpMobileSwipe: 'Celular: Rrëshqit Poshtë',
    helpPauseResume: 'Pauzë / Vazhdo',
    helpPowerupsTitle: 'Shufrat Speciale (Power-Up)',
    helpBombDetail: 'Shpërthen menjëherë kur bie, duke pastruar blloqet fqinje.',
    helpJokerDetail: 'Merr ngjyrën e fqinjit që prek për të plotësuar treshen.',
    helpFreezeDetail: 'Ngadalëson të gjitha shufrat në ardhje për 4 sekonda.',
    helpComboTitle: 'Kombo & Shpërthime Zinxhir',
    helpComboBefore1: 'Vija me ngjyrë që tkurret rreth kornizës tregon ',
    helpComboStrong1: 'kohën e kombos',
    helpComboMiddle: '. Pastrimi para se të mbarojë koha rrit shumëzuesin (',
    helpComboAfter: ') dhe dyfishon pikët.',
    helpModesTitle: 'Modalitetet, Format & Shumëkëndëshat (3–8)',
    helpModeClassicDailyLabel: 'Klasik & Ditore:',
    helpModeClassicDailyDesc: 'Klasiku prodhon blloqe të rastësishme; në Sfida Ditore të gjithë luajnë me të njëjtën radhë blloqesh.',
    helpModeBloomLabel: 'Modaliteti Shirit:',
    helpModeBloomDesc: 'Shumëkëndëshi hapet në kolona horizontale. Rrëshqit kolonat majtas-djathtas për të përputhur blloqet.',
    helpModeMorphLabel: 'Modaliteti Dinamik:',
    helpModeMorphDesc: 'Nis si shumëkëndësh dhe kalon në Shirit gjatë valëve të vështira e kombo-ve të larta.',
    helpModePolyLabel: '3–8 Shumëkëndëshat:',
    helpModePolyDesc: 'Trekëndësh, Katror, Pesëkëndësh, Gjashtëkëndësh, Shtatëkëndësh dhe Tetëkëndësh.',
    helpMenuGuideTitle: 'Çfarë bëjnë butonat e menusë?',
    helpCoinsDesc: 'Fitohen nga ndeshjet e detyrat; përdoren për tema ose ringjallje.',
    helpRewardsDesc: 'Ndiq detyrat ditore dhe mblidh shpërblimet e serisë 7-ditore.',
    helpShopDesc: 'Zhblloko dhe ndërro mes temave neon dhe asaj klasike të çelët.',
    helpLeaderboardDesc: 'Tregon renditjen e përgjithshme, javore dhe ditore sipas numrit të brinjëve.',
    helpAccountDesc: 'Regjistrohu me email për të ruajtur pikët, ndryshuar emrin dhe luajtur në pajisje të tjera.',
    helpSettingsDesc: 'Menaxho zërin, ndrysho gjuhën, hap udhëzuesin dhe instalo aplikacionin.',

    guestBannerTitle: 'Po luan si mysafir',
    guestBannerDesc: 'Pikët dhe monedhat ruhen vetëm në këtë shfletues. Krijo llogari për të ruajtur progresin.',
    registerTab: 'Regjistrohu',
    loginTab: 'Hyr',
    playerNameField: 'EMRI I LOJTARIT (NË RENDITJE)',
    playerNamePlaceholder: 'P.sh. PilotShpejt',
    emailField: 'ADRESA E EMAIL-IT',
    emailPlaceholder: 'shembull@email.com',
    passwordFieldRegister: 'FJALËKALIMI (MIN 6 KARAKTERE)',
    passwordField: 'FJALËKALIMI',
    passwordConfirmField: 'KONFIRMO FJALËKALIMIN',
    processingBtn: 'Duke përpunuar...',
    createAccountBtn: 'Krijo Llogari',
    loginBtn: 'Hyr',
    registeredBadge: '✓ E regjistruar',
    daysUnit: 'Ditë',
    loginStreakLabel: 'Seria Ditore',
    unlockedThemesLabel: 'Tema të Hapura',
    changeNamePlaceholder: 'Shkruaj emrin e lojtarit',
    savingBtn: 'Duke ruajtur...',
    saveBtn: 'Ruaj',
    loggingOutBtn: 'Duke dalë...',
    logoutBtn: 'Dil',
    privacyPolicy: 'Politika e Privatësisë (GDPR)',
    termsOfUse: 'Kushtet e Përdorimit',
    deleteAccountTitle: 'Fshirja e Llogarisë & të Dhënave',
    deleteAccountDesc: 'Ky veprim fshin përgjithmonë të gjitha pikët, renditjen, temat dhe email-in.',
    deleteAccountBtn: 'Fshi Llogarinë dhe Të Dhënat',
    deleteAccountConfirmBtn: 'Po, Fshi Përgjithmonë',
    cancelBtn: 'Anulo',

    dailyQuestsTab: 'Detyrat Ditore',
    sevenDayStreakTab: 'Seria 7-Ditore',
    coinUnit: 'Coin',
    claimedBtn: 'Marrë',
    claimRewardBtn: 'Merr Shpërblimin',
    streakIntroDesc: 'Hyr çdo ditë në lojë për të mbledhur shpërblime në rritje GyroCoins! Ditën e 7-të të pret bonusi i madh.',
    dayUpperPrefix: 'DITA',
    readyExcl: 'Gati!',
    claimDayRewardPrefix: 'Merr Shpërblimin e Ditës',
    claimDayRewardMid: '',
    todayRewardClaimedBtn: 'Shpërblimi i sotëm u mor ✓',

    equippedBtn: 'Zgjedhur',
    equipBtn: 'Përdor',
    backgroundTitle: 'Sfondi',

    lbGlobal: 'Gjithsej',
    lbWeekly: 'Javore',
    lbDaily: 'Ditore',
    playersUnit: 'lojtarë',
    yourRankUpper: 'RANGU YT',
    lbEmpty: 'Ende nuk ka pikë të regjistruara.',
    lbMaxComboPrefix: 'Kombo Maks',
    lbBlocksUnit: 'Blloqe',
    lbNoScoreSlot: 'Vend i Lirë',
    lbPlayToRankHint: 'Përfundo një lojë për t’u shfaqur në renditje',
    youBadge: 'Ti',

    modalAvatar: 'Avatari & Kornizat',
    avatarPresetsTitle: 'Avatarët e Gatshëm',
    avatarUploadBtn: 'Ngarko Foto',
    avatarUploadingBtn: 'Duke përpunuar...',
    avatarResetDefaultBtn: 'Kthe në Parazgjedhur',
    avatarCustomActive: 'Foto e Personalizuar',
    avatarUploadHint: 'Prerje katrore automatike · PNG, JPG, WEBP',
    avatarErrInvalidImage: 'Zgjidh një skedar imazhi të vlefshëm.',
    avatarErrTooLarge: 'Imazhi është shumë i madh. Provo një foto më të vogël.',
    avatarErrProcessFailed: 'Imazhi nuk u përpunua dot. Provo përsëri.',
    avatarFramesTitle: 'Kornizat e Avatarit',
    avatarFramesSoonBadge: 'Së shpejti te Shpërblimet',
    avatarApplyBtn: 'Ruaj Avatarin',
    changeAvatarAction: 'Ndrysho Avatarin',
    avatarFrameNames: {
      default: 'Standarde',
      'neon-cyan': 'Kibernetike Neon',
      'solar-gold': 'Kampion i Artë',
      'emerald-aura': 'Aura Smerald',
      'crimson-vip': 'VIP i Kuq',
      'royal-prism': 'Prizëm Mbretëror'
    },
    avatarPresetNames: {
      'preset:pilot': 'GyroPilot',
      'preset:capybara': 'Kapibara',
      'preset:cloud': 'Reja',
      'preset:fox': 'Dhelpra',
      'preset:cat': 'Macja Neon',
      'preset:unicorn': 'Njëbrirësh',
      'preset:owl': 'Bilge Bufi',
      'preset:panda': 'Panda',
      'preset:dragon': 'Dragoi Smerald',
      'preset:bot': 'Astro Bot'
    },

    soundEffectsTitle: 'Efektet Zanore',
    soundEffectsDesc: 'Zërat e goditjes, kombos dhe fuqive speciale',
    soundOn: 'Aktiv',
    soundOff: 'Joaktiv',
    settingsAvatarTitle: 'Avatari & Korniza',
    settingsAvatarDesc: 'Zgjidh avatar të gatshëm, ngarko foto ose shiko kornizat',
    guideCardTitle: 'Si të luash & Udhëzuesi',
    guideCardDesc: 'Rregullat, fuqitë speciale, kombo dhe këshilla',
    openBtn: 'Hap',
    installCardTitle: 'Instalo Aplikacionin',
    installCardDesc: 'Shtoje në ekranin kryesor për ekran të plotë dhe offline',
    installShortBtn: 'Instalo',

    installPlayLikeApp: 'Luaj si Aplikacion',
    installIntroDesc: 'Instalo GYROGON në ekranin kryesor ose desktop për të luajtur me ekran të plotë dhe offline.',
    installNowBtn: 'Instalo Tani',
    iosStep1Title: 'Prek butonin Ndaj (Share)',
    iosStep1Before: 'Prek ikonën ',
    iosStep1Strong: 'Share',
    iosStep1After: ' në shiritin e Safari.',
    iosStep2Title: 'Add to Home Screen',
    iosStep2Before: 'Zgjidh ',
    iosStep2Mid: ' nga lista dhe konfirmo ',
    iosStep2Strong: 'Add',
    iosStep2After: ' lart djathtas.',
    webStep1Title: 'Hap Menunë e Shfletuesit ose Ikonën Instalo',
    webStep1Before: 'Kliko ikonën ',
    webStep1Strong: 'Install',
    webStep1After: ' në shiritin e adresës ose hap menunë e shfletuesit.',
    webStep2Title: 'Konfirmo Instalimin',
    webStep2Before: 'Zgjidh ',
    webStep2Strong1: 'Install GYROGON',
    webStep2Or: ' ose ',
    webStep2Strong2: 'Add to Home Screen',
    webStep2After: ' për ta përfunduar.',
    offlineCacheReady: 'Memoria offline është gati',

    bannedTitle: 'Llogaria është Kufizuar',
    bannedPermDesc: 'Kjo llogari është kufizuar përgjithmonë.',
    bannedUntilPrefix: 'Data e përfundimit:',
    bannedTempDesc: 'Është aplikuar kufizim i përkohshëm.',
    bannedDetailHeading: 'Detajet e Kufizimit',
    bannedDefaultReason: 'Llogaria u kufizua përkohësisht ose përgjithmonë për shkak të shkeljes së rregullave.',
    recheckStatusBtn: 'Kontrollo Përsëri Statusin'
  }
};
