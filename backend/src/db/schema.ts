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
  displayName: varchar('display_name', { length: 64 }).notNull().default('HexaPlayer'),
  avatarUrl: text('avatar_url'),
  appleSub: varchar('apple_sub', { length: 255 }).unique(),
  googleSub: varchar('google_sub', { length: 255 }).unique(),
  facebookId: varchar('facebook_id', { length: 255 }).unique(),
  hexaCoins: integer('hexa_coins').notNull().default(100),
  streakCount: integer('streak_count').notNull().default(0),
  lastLoginDate: varchar('last_login_date', { length: 10 }),
  lastStreakClaimDate: varchar('last_streak_claim_date', { length: 10 }),
  highScoreClassic: integer('high_score_classic').notNull().default(0),
  highScoreDaily: integer('high_score_daily').notNull().default(0),
  equippedTheme: varchar('equipped_theme', { length: 32 }).notNull().default('hextris'),
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
