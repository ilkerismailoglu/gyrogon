import { Check, Coins, Lock, Smile, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { REWARDS_ECONOMY_ENABLED } from '../config/features';
import { TranslationDict } from '../i18n/translations';
import {
  AVATAR_FRAMES,
  AvatarFrameId,
  DEFAULT_AVATAR_FRAME,
  DEFAULT_AVATAR_URL,
  PRESET_AVATARS,
  PlayerAvatar
} from './AvatarCatalog';

interface AvatarPickerModalProps {
  currentAvatarUrl: string;
  currentFrameId: string;
  unlockedItems: string[];
  coins: number;
  purchasingFrameId: AvatarFrameId | null;
  onPurchaseFrame: (frameId: AvatarFrameId) => Promise<boolean>;
  showFrames?: boolean;
  isLight: boolean;
  t: TranslationDict;
  onSave: (avatarUrl: string, frameId: string) => Promise<void>;
  onCancel: () => void;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  currentAvatarUrl,
  currentFrameId,
  unlockedItems,
  coins,
  purchasingFrameId,
  onPurchaseFrame,
  showFrames = REWARDS_ECONOMY_ENABLED,
  isLight,
  t,
  onSave,
  onCancel
}) => {
  const [activeTab, setActiveTab] = useState<'avatars' | 'frames'>('avatars');
  const [draftAvatar, setDraftAvatar] = useState<string>(currentAvatarUrl || DEFAULT_AVATAR_URL);
  const [draftFrame, setDraftFrame] = useState<string>(currentFrameId || DEFAULT_AVATAR_FRAME);
  const [previewLockedFrame, setPreviewLockedFrame] = useState<AvatarFrameId | null>(null);
  const [saving, setSaving] = useState(false);

  const mutedText = isLight ? 'text-[#5b6b78]' : 'text-slate-400';
  const surfaceBox = isLight
    ? 'bg-[#ecf0f1] border-[#bdc3c7]'
    : 'bg-white/5 border-white/10';
  const subPill = isLight
    ? 'bg-white hover:bg-slate-50 text-[#2c3e50] border border-[#bdc3c7]'
    : 'bg-black/35 hover:bg-white/10 text-slate-100 border border-white/15';

  const activePreviewFrame = previewLockedFrame ?? draftFrame;
  const effectiveShowFrames = Boolean(showFrames);
  const effectiveTab = effectiveShowFrames ? activeTab : 'avatars';
  const effectivePreviewFrame = effectiveShowFrames
    ? activePreviewFrame
    : currentFrameId || DEFAULT_AVATAR_FRAME;
  const activePresetMeta = PRESET_AVATARS.find((p) => p.id === draftAvatar);
  const previewTitle = activePresetMeta
    ? t.avatarPresetNames[activePresetMeta.id]
    : t.avatarCustomActive;

  const isFrameUnlocked = (frameId: AvatarFrameId): boolean =>
    frameId === 'default' || unlockedItems.includes(frameId);

  const previewLockedFrameMeta = previewLockedFrame
    ? AVATAR_FRAMES.find((f) => f.id === previewLockedFrame)
    : undefined;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(draftAvatar, draftFrame);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Live Avatar + Frame Preview Card */}
      <div className={`p-3.5 rounded-2xl border flex items-center gap-3.5 ${surfaceBox}`}>
        <PlayerAvatar
          avatarUrl={draftAvatar}
          frameId={effectivePreviewFrame}
          size="xl"
          isLight={isLight}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{previewTitle}</div>
          {effectiveShowFrames && (
            <div className={`text-[11px] truncate ${mutedText}`}>
              {t.avatarFrameNames[(effectivePreviewFrame as AvatarFrameId) || 'default'] ??
                t.avatarFrameNames.default}
              {previewLockedFrameMeta ? ` · ${previewLockedFrameMeta.price} ${t.coinUnit}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Avatars / Frames Tab Switcher */}
      {effectiveShowFrames && (
        <div
          className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
            isLight ? 'bg-[#ecf0f1] border-[#bdc3c7]' : 'bg-black/30 border-white/10'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('avatars')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'avatars'
                ? isLight
                  ? 'bg-[#2c3e50] text-white'
                  : 'bg-cyan-400/20 text-cyan-200'
                : mutedText
            }`}
          >
            <Smile className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="truncate">{t.avatarPresetsTitle}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('frames')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'frames'
                ? isLight
                  ? 'bg-[#2c3e50] text-white'
                  : 'bg-cyan-400/20 text-cyan-200'
                : mutedText
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{t.avatarFramesTitle}</span>
          </button>
        </div>
      )}

      {/* Active Tab Content */}
      <div className={`p-3.5 rounded-2xl border space-y-2.5 ${surfaceBox}`}>
        {effectiveTab === 'avatars' ? (
          <div className="grid grid-cols-5 gap-2">
            {PRESET_AVATARS.map((preset) => {
              const selected = draftAvatar === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDraftAvatar(preset.id)}
                  title={t.avatarPresetNames[preset.id]}
                  className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all cursor-pointer ${
                    selected
                      ? isLight
                        ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-400/60'
                        : 'bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/40'
                      : isLight
                        ? 'bg-white border-[#d5dbdb] hover:border-slate-400'
                        : 'bg-black/30 border-white/10 hover:border-white/30'
                  }`}
                >
                  <PlayerAvatar
                    avatarUrl={preset.id}
                    frameId="default"
                    size="sm"
                    isLight={isLight}
                  />
                  <span className="text-[9px] font-semibold truncate w-full text-center leading-tight">
                    {t.avatarPresetNames[preset.id]}
                  </span>
                  {selected && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className={`text-[11px] font-mono uppercase tracking-wider font-bold ${mutedText}`}>
                {t.avatarFramesTitle}
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isLight
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                }`}
              >
                <Coins className="w-3 h-3 shrink-0" />
                <span>{coins.toLocaleString()} {t.coinUnit}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {AVATAR_FRAMES.map((frame) => {
                const unlocked = isFrameUnlocked(frame.id);
                const selected = unlocked && draftFrame === frame.id && !previewLockedFrame;
                const previewingLocked = !unlocked && previewLockedFrame === frame.id;
                return (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => {
                      if (unlocked) {
                        setDraftFrame(frame.id);
                        setPreviewLockedFrame(null);
                      } else {
                        setPreviewLockedFrame((prev) => (prev === frame.id ? null : frame.id));
                      }
                    }}
                    className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all cursor-pointer ${
                      selected
                        ? isLight
                          ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-400/50'
                          : 'bg-cyan-500/20 border-cyan-400 ring-2 ring-cyan-400/35'
                        : previewingLocked
                          ? isLight
                            ? 'bg-amber-50 border-amber-400'
                            : 'bg-amber-500/15 border-amber-400/50'
                          : isLight
                            ? 'bg-white border-[#d5dbdb] hover:border-slate-400'
                            : 'bg-black/30 border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className={!unlocked ? 'opacity-90' : ''}>
                      <PlayerAvatar
                        avatarUrl={draftAvatar}
                        frameId={frame.id}
                        size="sm"
                        isLight={isLight}
                      />
                    </div>
                    <span className="text-[10px] font-bold truncate w-full text-center leading-tight">
                      {t.avatarFrameNames[frame.id]}
                    </span>
                    {!unlocked ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                          coins >= frame.price
                            ? isLight
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-amber-500/20 text-amber-300'
                            : isLight
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-white/10 text-slate-400'
                        }`}
                      >
                        <Lock className="w-2.5 h-2.5" />
                        {frame.price}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {previewLockedFrameMeta && !isFrameUnlocked(previewLockedFrameMeta.id) && (
              <div
                className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                  isLight
                    ? 'bg-white border-amber-300 text-[#2c3e50]'
                    : 'bg-amber-500/10 border-amber-400/30 text-slate-100'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-xs truncate">
                    {t.avatarFrameNames[previewLockedFrameMeta.id]}
                  </div>
                  <div className={`text-[10px] font-mono ${mutedText}`}>
                    {previewLockedFrameMeta.price} {t.coinUnit}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={coins < previewLockedFrameMeta.price || purchasingFrameId !== null}
                  onClick={() => {
                    const targetId = previewLockedFrameMeta.id;
                    void onPurchaseFrame(targetId).then((ok) => {
                      if (ok) {
                        setDraftFrame(targetId);
                        setPreviewLockedFrame(null);
                      }
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
                >
                  {purchasingFrameId === previewLockedFrameMeta.id
                    ? t.processingBtn
                    : coins >= previewLockedFrameMeta.price
                      ? t.buyFrameBtn
                      : t.insufficientCoinsShort}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs cursor-pointer ${subPill}`}
        >
          {t.cancelBtn}
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm cursor-pointer disabled:opacity-50 ${
            isLight
              ? 'bg-[#2ecc71] hover:bg-[#27ae60] text-white'
              : 'bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950'
          }`}
        >
          {saving ? t.savingBtn : t.avatarApplyBtn}
        </button>
      </div>
    </div>
  );
};
