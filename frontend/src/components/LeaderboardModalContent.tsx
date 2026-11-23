import { Crown } from 'lucide-react';
import React from 'react';
import { TranslationDict } from '../i18n/translations';
import { LeaderboardBoard, LeaderboardData, LeaderboardEntry } from '../services/api';
import { PlayerAvatar } from './AvatarCatalog';

interface LeaderboardModalContentProps {
  lbBoard: LeaderboardBoard;
  leaderboardData: LeaderboardData | null;
  playerName: string;
  avatarUrl: string;
  avatarFrame: string;
  periodLabel: string;
  isLight: boolean;
  locale: string;
  t: TranslationDict;
  onSelectBoard: (board: LeaderboardBoard) => void;
}

const PENNANT_CLIP: React.CSSProperties = {
  clipPath: 'polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%)'
};

const RankMedalBadge: React.FC<{ rank: number; isLight: boolean }> = ({ rank, isLight }) => {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 border border-amber-700/40 text-slate-950 font-extrabold text-xs flex flex-col items-center justify-center shrink-0 shadow-sm">
        <Crown className="w-3.5 h-3.5 fill-amber-100 text-amber-950 -mb-0.5" />
        <span className="leading-none text-[10px]">1</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-slate-200 to-slate-400 border border-slate-600/35 text-slate-900 font-extrabold text-xs flex flex-col items-center justify-center shrink-0 shadow-sm">
        <Crown className="w-3.5 h-3.5 fill-white text-slate-700 -mb-0.5" />
        <span className="leading-none text-[10px]">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-orange-300 to-amber-700 border border-amber-950/35 text-white font-extrabold text-xs flex flex-col items-center justify-center shrink-0 shadow-sm">
        <Crown className="w-3.5 h-3.5 fill-orange-100 text-amber-950 -mb-0.5" />
        <span className="leading-none text-[10px]">3</span>
      </div>
    );
  }
  return (
    <div
      className={`min-w-8 px-1.5 h-8 rounded-xl font-mono font-extrabold text-xs flex items-center justify-center shrink-0 tabular-nums ${
        isLight
          ? 'bg-white border border-[#bdc3c7] text-[#2c3e50]'
          : 'bg-white/10 border border-white/15 text-slate-200'
      }`}
    >
      {rank}
    </div>
  );
};

export const LeaderboardModalContent: React.FC<LeaderboardModalContentProps> = ({
  lbBoard,
  leaderboardData,
  playerName,
  avatarUrl,
  avatarFrame,
  periodLabel,
  isLight,
  locale,
  t,
  onSelectBoard
}) => {
  const mutedText = isLight ? 'text-[#5b6b78]' : 'text-slate-400';
  const entries = leaderboardData?.entries ?? [];
  const first = entries[0];
  const second = entries[1];
  const third = entries[2];

  const podiumSlots: Array<{
    rank: 1 | 2 | 3;
    entry?: LeaderboardEntry;
    offsetClass: string;
    bannerStyle: string;
    badgeBg: string;
    wreathStroke: string;
  }> = [
    {
      rank: 2,
      entry: second,
      offsetClass: 'mt-3 sm:mt-4',
      bannerStyle: isLight
        ? 'bg-gradient-to-b from-sky-500 to-blue-700 text-white'
        : 'bg-gradient-to-b from-sky-500/85 to-blue-900/95 text-white border-x border-t border-sky-400/40',
      badgeBg: 'bg-gradient-to-b from-slate-100 to-slate-300 text-slate-900 border-slate-500',
      wreathStroke: '#7dd3fc'
    },
    {
      rank: 1,
      entry: first,
      offsetClass: 'mt-0',
      bannerStyle: isLight
        ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white'
        : 'bg-gradient-to-b from-rose-500/90 to-pink-900/95 text-white border-x border-t border-rose-400/50',
      badgeBg: 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-amber-700',
      wreathStroke: '#fde047'
    },
    {
      rank: 3,
      entry: third,
      offsetClass: 'mt-4 sm:mt-5',
      bannerStyle: isLight
        ? 'bg-gradient-to-b from-emerald-500 to-green-700 text-white'
        : 'bg-gradient-to-b from-emerald-500/85 to-teal-900/95 text-white border-x border-t border-emerald-400/40',
      badgeBg: 'bg-gradient-to-b from-orange-300 to-amber-700 text-white border-amber-900',
      wreathStroke: '#a7f3d0'
    }
  ];

  const myRankData = leaderboardData?.me;
  const restEntries = entries.slice(3, 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Top Board Switcher Tabs (Global | Haftalık | Günlük) */}
      <div
        className={`grid grid-cols-3 gap-1.5 p-1 rounded-2xl border ${
          isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-black/40 border-white/10'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectBoard('classic')}
          className={`py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            lbBoard === 'classic'
              ? isLight
                ? 'bg-[#2c3e50] text-white shadow-sm'
                : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 shadow-sm'
              : mutedText
          }`}
        >
          {t.lbGlobal}
        </button>
        <button
          type="button"
          onClick={() => onSelectBoard('weekly')}
          className={`py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            lbBoard === 'weekly'
              ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-sm'
              : mutedText
          }`}
        >
          {t.lbWeekly}
        </button>
        <button
          type="button"
          onClick={() => onSelectBoard('daily')}
          className={`py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            lbBoard === 'daily'
              ? 'bg-[#e74c3c] text-white shadow-sm'
              : mutedText
          }`}
        >
          {t.lbDaily}
        </button>
      </div>

      {/* Period & Players Bar */}
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold px-1">
        <span
          className={`px-2.5 py-1 rounded-full border ${
            isLight
              ? 'bg-[#ecf0f1] border-[#bdc3c7] text-[#2c3e50]'
              : 'bg-white/10 border-white/15 text-cyan-200'
          }`}
        >
          {periodLabel}
        </span>
        {leaderboardData && (
          <span className={mutedText}>
            {leaderboardData.totalPlayers} {t.playersUnit}
            {leaderboardData.engine === 'local' ? ` · ${t.offlineShort}` : ''}
          </span>
        )}
      </div>

      {/* Top 3 Hanging Pennant Podium (#2 Left · #1 Tall Center · #3 Right) */}
      <div
        className={`relative rounded-2xl p-2.5 sm:p-3 border overflow-hidden ${
          isLight
            ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-700'
            : 'bg-gradient-to-b from-[#0c1428] to-[#060914] border-white/10'
        }`}
      >
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 items-start">
          {podiumSlots.map((slot) => {
            const e = slot.entry;
            const sideText = e?.sides ? t.polygons[e.sides] : '';
            return (
              <div key={slot.rank} className={`flex flex-col items-center ${slot.offsetClass}`}>
                {/* Shield Number Above Banner */}
                <div
                  className={`relative z-10 -mb-2.5 w-7 h-7 rounded-lg border-2 font-extrabold text-xs flex items-center justify-center shadow-md ${slot.badgeBg}`}
                >
                  {slot.rank === 1 ? (
                    <Crown className="w-3.5 h-3.5 fill-amber-100 text-slate-950" />
                  ) : (
                    slot.rank
                  )}
                </div>

                {/* Pennant Card */}
                <div
                  style={PENNANT_CLIP}
                  className={`w-full pt-4 pb-5 px-1.5 sm:px-2 flex flex-col items-center text-center shadow-lg ${slot.bannerStyle} ${
                    slot.rank === 1 ? 'min-h-[144px] sm:min-h-[154px]' : 'min-h-[130px] sm:min-h-[138px]'
                  }`}
                >
                  <div className="relative flex items-center justify-center mb-1.5">
                    {/* Subtle Left & Right Wreath Accents */}
                    <svg
                      viewBox="0 0 16 32"
                      className="w-3 h-7 -mr-0.5 opacity-80 shrink-0"
                      fill="none"
                    >
                      <path
                        d="M12 28 C5 23, 4 11, 11 4"
                        stroke={slot.wreathStroke}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <PlayerAvatar
                      avatarUrl={e?.avatarUrl}
                      frameId={e?.avatarFrame}
                      size={slot.rank === 1 ? 'md' : 'sm'}
                      isLight={false}
                    />
                    <svg
                      viewBox="0 0 16 32"
                      className="w-3 h-7 -ml-0.5 opacity-80 shrink-0"
                      fill="none"
                    >
                      <path
                        d="M4 28 C11 23, 12 11, 5 4"
                        stroke={slot.wreathStroke}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div className="font-extrabold text-[11px] sm:text-xs leading-tight truncate w-full px-0.5">
                    {e ? e.playerName : t.lbNoScoreSlot}
                  </div>
                  <div className="text-[9px] sm:text-[10px] opacity-80 truncate w-full mt-0.5 min-h-[14px]">
                    {e ? sideText : '—'}
                  </div>

                  <div className="mt-auto pt-1.5 flex items-center justify-center gap-1 font-extrabold text-[11px] sm:text-xs text-amber-200 drop-shadow-xs">
                    <Crown className="w-3 h-3 text-amber-300 fill-amber-300 shrink-0" />
                    <span className="tabular-nums">
                      {e ? e.score.toLocaleString(locale) : '0'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable Ranked Rows (#4 - #100) */}
      {entries.length === 0 ? (
        <div
          className={`rounded-2xl p-2 border ${
            isLight
              ? 'bg-[#ecf0f1] border-[#bdc3c7]'
              : 'bg-black/35 border-white/10'
          }`}
        >
          <p className={`text-center text-xs py-8 ${mutedText}`}>{t.lbEmpty}</p>
        </div>
      ) : restEntries.length > 0 ? (
        <div
          className={`rounded-2xl p-2 border max-h-[240px] sm:max-h-[270px] overflow-y-auto custom-scroll space-y-1.5 ${
            isLight
              ? 'bg-[#ecf0f1] border-[#bdc3c7] custom-scroll-light'
              : 'bg-black/35 border-white/10 custom-scroll-dark'
          }`}
        >
          {restEntries.map((entry) => {
            const isMe = myRankData?.entry.memberId === entry.memberId;
            return (
              <div
                key={`${entry.memberId}-${entry.rank}`}
                className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-colors ${
                  isMe
                    ? isLight
                      ? 'bg-sky-50 border-sky-400'
                      : 'bg-cyan-500/15 border-cyan-400/45'
                    : isLight
                      ? 'bg-white border-[#d5dbdb]'
                      : 'bg-[#0F172A]/90 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <RankMedalBadge rank={entry.rank} isLight={isLight} />
                  <PlayerAvatar
                    avatarUrl={entry.avatarUrl}
                    frameId={entry.avatarFrame}
                    size="sm"
                    isLight={isLight}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-xs sm:text-sm truncate flex items-center gap-1.5">
                      <span className="truncate">{entry.playerName}</span>
                      {isMe && (
                        <span className="px-1.5 py-0.5 rounded-md bg-sky-500 text-white text-[9px] font-bold shrink-0">
                          {t.youBadge}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] truncate ${mutedText}`}>
                      {entry.sides ? `${t.polygons[entry.sides]} · ` : ''}
                      x{entry.maxCombo} · {entry.blocksCleared} {t.lbBlocksUnit}
                    </div>
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-extrabold text-xs sm:text-sm tabular-nums shrink-0 ${
                    isLight
                      ? 'bg-[#ecf0f1] text-[#2c3e50]'
                      : 'bg-white/10 text-amber-300 border border-white/10'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  <span>{entry.score.toLocaleString(locale)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Pinned Bottom Self Row */}
      <div
        className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 shadow-md ${
          isLight
            ? 'bg-sky-50 border-sky-400 text-[#2c3e50]'
            : 'bg-sky-500/15 border-sky-400/50 text-white'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`min-w-8 px-1.5 h-8 rounded-xl font-mono font-extrabold text-xs flex items-center justify-center shrink-0 tabular-nums ${
              isLight ? 'bg-[#2c3e50] text-white' : 'bg-cyan-400 text-slate-950'
            }`}
          >
            {myRankData ? myRankData.rank : '—'}
          </div>
          <PlayerAvatar
            avatarUrl={myRankData?.entry.avatarUrl ?? avatarUrl}
            frameId={myRankData?.entry.avatarFrame ?? avatarFrame}
            size="sm"
            isLight={isLight}
          />
          <div className="min-w-0">
            <div className="font-extrabold text-xs sm:text-sm truncate">
              {myRankData ? myRankData.entry.playerName : playerName}
            </div>
            <div className={`text-[10px] truncate ${isLight ? 'text-sky-900/75' : 'text-sky-200/80'}`}>
              {myRankData
                ? `${myRankData.entry.sides ? `${t.polygons[myRankData.entry.sides]} · ` : ''}x${myRankData.entry.maxCombo} · ${myRankData.entry.blocksCleared} ${t.lbBlocksUnit}`
                : t.lbPlayToRankHint}
            </div>
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-extrabold text-xs sm:text-sm tabular-nums shrink-0 ${
            isLight ? 'bg-white border border-sky-300 text-[#2c3e50]' : 'bg-black/40 text-amber-300 border border-white/15'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
          <span>{myRankData ? myRankData.entry.score.toLocaleString(locale) : '0'}</span>
        </div>
      </div>
    </div>
  );
};
