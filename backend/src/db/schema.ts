import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestDeviceId: varchar('guest_device_id', { length: 128 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  displayName: varchar('display_name', { length: 64 }).notNull().default('GyroPilot'),
  avatarUrl: text('avatar_url').default('preset:pilot'),
  avatarFrame: varchar('avatar_frame', { length: 32 }).notNull().default('default'),
  appleSub: varchar('apple_sub', { length: 255 }).unique(),
  googleSub: varchar('google_sub', { length: 255 }).unique(),
  facebookId: varchar('facebook_id', { length: 255 }).unique(),
  hexaCoins: integer('hexa_coins').notNull().default(100),
  streakCount: integer('streak_count').notNull().default(0),
  lastLoginDate: varchar('last_login_date', { length: 10 }),
  lastStreakClaimDate: varchar('last_streak_claim_date', { length: 10 }),
  highScoreClassic: integer('high_score_classic').notNull().default(0),
  highScoreDaily: integer('high_score_daily').notNull().default(0),
  equippedTheme: varchar('equipped_theme', { length: 32 }).notNull().default('cyberpunk'),
  isBanned: boolean('is_banned').notNull().default(false),
  bannedUntil: timestamp('banned_until'),
  banReason: text('ban_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const shopItems = pgTable('shop_items', {
  code: varchar('code', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  subtitle: text('subtitle').notNull().default(''),
  category: varchar('category', { length: 32 }).notNull().default('theme'),
  price: integer('price').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const userInventory = pgTable(
  'user_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    itemCode: varchar('item_code', { length: 64 })
      .references(() => shopItems.code, { onDelete: 'cascade' })
      .notNull(),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull()
  },
  (table) => [uniqueIndex('user_inventory_user_item_idx').on(table.userId, table.itemCode)]
);

export const userQuests = pgTable(
  'user_quests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    questDate: varchar('quest_date', { length: 10 }).notNull(),
    questCode: varchar('quest_code', { length: 32 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    target: integer('target').notNull(),
    progress: integer('progress').notNull().default(0),
    rewardCoins: integer('reward_coins').notNull().default(40),
    claimed: boolean('claimed').notNull().default(false),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('user_quests_user_date_code_idx').on(
      table.userId,
      table.questDate,
      table.questCode
    )
  ]
);

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  mode: varchar('mode', { length: 16 }).notNull().default('classic'),
  sides: integer('sides').notNull().default(6),
  seed: varchar('seed', { length: 128 }).notNull(),
  signature: varchar('signature', { length: 128 }).notNull(),
  playerName: varchar('player_name', { length: 64 }).notNull().default('HexaPlayer'),
  verified: boolean('verified').notNull().default(false),
  finalScore: integer('final_score'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at')
});

export const scores = pgTable(
  'scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .references(() => gameSessions.id, { onDelete: 'cascade' })
      .notNull(),
    playerName: varchar('player_name', { length: 64 }).notNull().default('HexaPlayer'),
    mode: varchar('mode', { length: 16 }).notNull(),
    sides: integer('sides').notNull().default(6),
    score: integer('score').notNull(),
    maxCombo: integer('max_combo').notNull().default(1),
    blocksCleared: integer('blocks_cleared').notNull().default(0),
    coinsEarned: integer('coins_earned').notNull().default(0),
    moveHash: varchar('move_hash', { length: 128 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    index('scores_mode_score_idx').on(table.mode, table.score),
    index('scores_user_mode_idx').on(table.userId, table.mode)
  ]
);

export const dailySeeds = pgTable('daily_seeds', {
  date: varchar('date', { length: 10 }).primaryKey(),
  seed: varchar('seed', { length: 128 }).notNull(),
  targetBronze: integer('target_bronze').notNull().default(500),
  targetSilver: integer('target_silver').notNull().default(1500),
  targetGold: integer('target_gold').notNull().default(3000),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const adRewards = pgTable('ad_rewards', {
  transactionId: varchar('transaction_id', { length: 128 }).primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  rewardItem: varchar('reward_item', { length: 64 }).notNull(),
  rewardAmount: integer('reward_amount').notNull().default(50),
  keyId: varchar('key_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const adminRewards = pgTable(
  'admin_rewards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    recipientName: varchar('recipient_name', { length: 64 }).notNull(),
    scope: varchar('scope', { length: 24 }).notNull().default('single'),
    coinsAmount: integer('coins_amount').notNull().default(0),
    themeCode: varchar('theme_code', { length: 64 }),
    reason: text('reason').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [index('admin_rewards_created_idx').on(table.createdAt)]
);

export const adminSettings = pgTable('admin_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const siteVisits = pgTable(
  'site_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    visitToken: varchar('visit_token', { length: 64 }).notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    deviceId: varchar('device_id', { length: 128 }),
    visitorHash: varchar('visitor_hash', { length: 64 }).notNull(),
    isReturning: boolean('is_returning').notNull().default(false),
    landingPath: varchar('landing_path', { length: 255 }).notNull().default('/'),
    referrerUrl: varchar('referrer_url', { length: 500 }),
    referrerHost: varchar('referrer_host', { length: 128 }).notNull().default('direct'),
    sourceCategory: varchar('source_category', { length: 32 }).notNull().default('direct'),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 120 }),
    countryCode: varchar('country_code', { length: 16 }).notNull().default('UNKNOWN'),
    region: varchar('region', { length: 120 }),
    city: varchar('city', { length: 120 }),
    continent: varchar('continent', { length: 16 }),
    timezone: varchar('timezone', { length: 64 }),
    language: varchar('language', { length: 32 }),
    deviceType: varchar('device_type', { length: 24 }).notNull().default('desktop'),
    osName: varchar('os_name', { length: 48 }).notNull().default('Diğer'),
    osVersion: varchar('os_version', { length: 32 }),
    browserName: varchar('browser_name', { length: 48 }).notNull().default('Diğer'),
    browserVersion: varchar('browser_version', { length: 32 }),
    appMode: varchar('app_mode', { length: 24 }).notNull().default('browser'),
    screenWidth: integer('screen_width'),
    screenHeight: integer('screen_height'),
    viewportWidth: integer('viewport_width'),
    viewportHeight: integer('viewport_height'),
    connectionType: varchar('connection_type', { length: 24 }),
    siteDurationSec: integer('site_duration_sec').notNull().default(0),
    playDurationSec: integer('play_duration_sec').notNull().default(0),
    gamesStarted: integer('games_started').notNull().default(0),
    gamesCompleted: integer('games_completed').notNull().default(0),
    bestScore: integer('best_score').notNull().default(0),
    lastMode: varchar('last_mode', { length: 16 }),
    lastSides: integer('last_sides'),
    lastLayout: varchar('last_layout', { length: 16 }),
    isPlayingNow: boolean('is_playing_now').notNull().default(false),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull()
  },
  (table) => [
    index('site_visits_started_idx').on(table.startedAt),
    index('site_visits_last_seen_idx').on(table.lastSeenAt),
    index('site_visits_user_idx').on(table.userId),
    index('site_visits_geo_idx').on(table.countryCode, table.city),
    index('site_visits_visitor_idx').on(table.visitorHash)
  ]
);
