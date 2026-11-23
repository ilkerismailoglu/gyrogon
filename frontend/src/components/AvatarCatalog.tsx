import React, { useId, useState } from 'react';

export const DEFAULT_AVATAR_URL = 'preset:pilot';
export const DEFAULT_AVATAR_FRAME = 'default';

export type PresetAvatarId =
  | 'preset:pilot'
  | 'preset:capybara'
  | 'preset:cloud'
  | 'preset:fox'
  | 'preset:cat'
  | 'preset:unicorn'
  | 'preset:owl'
  | 'preset:panda'
  | 'preset:dragon'
  | 'preset:bot';

export type AvatarFrameId =
  | 'default'
  | 'neon-cyan'
  | 'solar-gold'
  | 'emerald-aura'
  | 'crimson-vip'
  | 'royal-prism';

export interface PresetAvatarMeta {
  id: PresetAvatarId;
  bgClass: string;
}

export interface AvatarFrameMeta {
  id: AvatarFrameId;
  price: number;
  previewRingLight: string;
  previewRingDark: string;
  badgeText?: string;
  badgeColorClass?: string;
}

export const PRESET_AVATARS: PresetAvatarMeta[] = [
  { id: 'preset:pilot', bgClass: 'from-sky-500 to-indigo-700' },
  { id: 'preset:capybara', bgClass: 'from-amber-400 to-orange-600' },
  { id: 'preset:cloud', bgClass: 'from-indigo-400 to-blue-700' },
  { id: 'preset:fox', bgClass: 'from-orange-400 to-rose-600' },
  { id: 'preset:cat', bgClass: 'from-fuchsia-600 to-purple-900' },
  { id: 'preset:unicorn', bgClass: 'from-violet-400 to-pink-500' },
  { id: 'preset:owl', bgClass: 'from-slate-600 to-indigo-900' },
  { id: 'preset:panda', bgClass: 'from-emerald-400 to-teal-700' },
  { id: 'preset:dragon', bgClass: 'from-lime-500 to-emerald-800' },
  { id: 'preset:bot', bgClass: 'from-cyan-500 to-slate-800' }
];

export const AVATAR_FRAMES: AvatarFrameMeta[] = [
  {
    id: 'default',
    price: 0,
    previewRingLight: 'border-2 border-[#2c3e50]/35 bg-white shadow-sm',
    previewRingDark: 'border-2 border-slate-300/45 bg-[#0F172A] shadow-sm'
  },
  {
    id: 'neon-cyan',
    price: 120,
    previewRingLight:
      'border-[2.5px] border-cyan-500 ring-2 ring-cyan-300/60 shadow-[0_0_10px_rgba(6,182,212,0.45)]',
    previewRingDark:
      'border-[2.5px] border-[#00F0FF] ring-2 ring-cyan-400/35 shadow-[0_0_12px_rgba(0,240,255,0.55)]'
  },
  {
    id: 'solar-gold',
    price: 180,
    previewRingLight:
      'border-[2.5px] border-amber-500 ring-2 ring-yellow-300/70 shadow-[0_0_10px_rgba(245,158,11,0.45)]',
    previewRingDark:
      'border-[2.5px] border-amber-400 ring-2 ring-amber-300/35 shadow-[0_0_12px_rgba(251,191,36,0.55)]',
    badgeText: '★',
    badgeColorClass: 'bg-amber-400 text-slate-950'
  },
  {
    id: 'emerald-aura',
    price: 220,
    previewRingLight:
      'border-[2.5px] border-emerald-500 ring-2 ring-emerald-300/60 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    previewRingDark:
      'border-[2.5px] border-[#00FF87] ring-2 ring-emerald-400/35 shadow-[0_0_12px_rgba(0,255,135,0.5)]'
  },
  {
    id: 'crimson-vip',
    price: 300,
    previewRingLight:
      'border-[2.5px] border-rose-600 ring-2 ring-amber-400/70 shadow-[0_0_10px_rgba(225,29,72,0.4)]',
    previewRingDark:
      'border-[2.5px] border-[#FF0055] ring-2 ring-amber-400/50 shadow-[0_0_12px_rgba(255,0,85,0.55)]',
    badgeText: 'VIP',
    badgeColorClass: 'bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950'
  },
  {
    id: 'royal-prism',
    price: 400,
    previewRingLight:
      'border-[2.5px] border-purple-600 ring-2 ring-pink-400/60 shadow-[0_0_10px_rgba(147,51,234,0.4)]',
    previewRingDark:
      'border-[2.5px] border-fuchsia-400 ring-2 ring-cyan-400/45 shadow-[0_0_14px_rgba(217,70,239,0.55)]'
  }
];

function isPresetId(val?: string | null): val is PresetAvatarId {
  return PRESET_AVATARS.some((a) => a.id === val);
}

function getFrameMeta(frameId?: string | null): AvatarFrameMeta {
  return AVATAR_FRAMES.find((f) => f.id === frameId) ?? AVATAR_FRAMES[0]!;
}

const renderPresetIllustration = (id: PresetAvatarId, gp: string): React.ReactNode => {
  switch (id) {
    case 'preset:pilot':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-pilot`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#312e81" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-pilot)`} />
          <path d="M12 64 C14 48, 50 48, 52 64 Z" fill="#1e293b" />
          <circle cx="32" cy="30" r="17" fill="#e2e8f0" />
          <path d="M18 28 C18 20, 46 20, 46 28 C46 35, 39 38, 32 38 C25 38, 18 35, 18 28 Z" fill="#0f172a" />
          <path d="M21 26 C24 23, 33 23, 38 25" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <circle cx="26" cy="30" r="2.2" fill="#00f0ff" />
          <circle cx="38" cy="30" r="2.2" fill="#00f0ff" />
          <polygon points="32,8 35,14 29,14" fill="#fbbf24" />
        </svg>
      );
    case 'preset:capybara':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-capy`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-capy)`} />
          <circle cx="20" cy="20" r="5" fill="#78350f" />
          <circle cx="44" cy="20" r="5" fill="#78350f" />
          <ellipse cx="32" cy="34" rx="18" ry="16" fill="#b45309" />
          <ellipse cx="32" cy="40" rx="12" ry="9" fill="#92400e" />
          <path d="M22 30 L27 30 M37 30 L42 30" stroke="#1c1917" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="29" cy="37" r="1.6" fill="#1c1917" />
          <circle cx="35" cy="37" r="1.6" fill="#1c1917" />
          <path d="M16 54 Q32 45 48 54 L48 64 L16 64 Z" fill="#16a34a" />
          <circle cx="32" cy="14" r="4.5" fill="#f97316" />
          <path d="M32 9 C34 7, 37 8, 35 11 Z" fill="#15803d" />
        </svg>
      );
    case 'preset:cloud':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-cloud`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-cloud)`} />
          <polygon points="34,12 27,24 33,24 29,34 40,21 34,21" fill="#facc15" />
          <path
            d="M17 44 C12 44 10 38 14 34 C14 27 22 23 29 26 C34 21 44 23 46 30 C52 31 53 40 47 44 Z"
            fill="#c7d2fe"
          />
          <circle cx="26" cy="35" r="2.2" fill="#1e1b4b" />
          <circle cx="38" cy="35" r="2.2" fill="#1e1b4b" />
          <path d="M29 38 Q32 41 35 38" stroke="#1e1b4b" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="22" cy="38" r="2" fill="#fda4af" opacity="0.7" />
          <circle cx="42" cy="38" r="2" fill="#fda4af" opacity="0.7" />
        </svg>
      );
    case 'preset:fox':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-fox`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#be123c" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-fox)`} />
          <polygon points="15,15 26,24 14,32" fill="#ea580c" />
          <polygon points="49,15 38,24 50,32" fill="#ea580c" />
          <polygon points="17,19 23,24 17,28" fill="#fef3c7" />
          <polygon points="47,19 41,24 47,28" fill="#fef3c7" />
          <ellipse cx="32" cy="37" rx="17" ry="15" fill="#f97316" />
          <path d="M16 38 Q24 34 32 45 Q40 34 48 38 Q44 52 32 52 Q20 52 16 38 Z" fill="#fffbeb" />
          <circle cx="25" cy="34" r="2.4" fill="#1c1917" />
          <circle cx="39" cy="34" r="2.4" fill="#1c1917" />
          <circle cx="32" cy="43" r="2.8" fill="#1c1917" />
        </svg>
      );
    case 'preset:cat':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-cat`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c026d3" />
              <stop offset="100%" stopColor="#3b0764" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-cat)`} />
          <polygon points="16,14 26,26 15,32" fill="#1e1b4b" />
          <polygon points="48,14 38,26 49,32" fill="#1e1b4b" />
          <polygon points="18,18 24,25 18,29" fill="#f472b6" />
          <polygon points="46,18 40,25 46,29" fill="#f472b6" />
          <circle cx="32" cy="37" r="16" fill="#0f172a" />
          <ellipse cx="25.5" cy="35" rx="2.8" ry="3.4" fill="#22d3ee" />
          <ellipse cx="38.5" cy="35" rx="2.8" ry="3.4" fill="#22d3ee" />
          <circle cx="25.5" cy="35" r="1.2" fill="#0f172a" />
          <circle cx="38.5" cy="35" r="1.2" fill="#0f172a" />
          <polygon points="32,40 29.5,43 34.5,43" fill="#f472b6" />
          <path d="M12 37 L20 38 M12 42 L20 41 M44 38 L52 37 M44 41 L52 42" stroke="#f472b6" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'preset:unicorn':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-uni`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-uni)`} />
          <polygon points="32,8 27,24 37,24" fill="#fde047" />
          <ellipse cx="32" cy="38" rx="16" ry="15" fill="#f8fafc" />
          <path d="M19 25 Q26 19 34 25" stroke="#c084fc" strokeWidth="5" strokeLinecap="round" fill="none" />
          <ellipse cx="32" cy="43" rx="11" ry="7" fill="#e9d5ff" />
          <circle cx="25" cy="35" r="2.5" fill="#3b0764" />
          <circle cx="39" cy="35" r="2.5" fill="#3b0764" />
          <circle cx="20" cy="40" r="2.3" fill="#f472b6" opacity="0.65" />
          <circle cx="44" cy="40" r="2.3" fill="#f472b6" opacity="0.65" />
        </svg>
      );
    case 'preset:owl':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-owl`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#1e1b4b" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-owl)`} />
          <ellipse cx="32" cy="38" rx="18" ry="17" fill="#6366f1" />
          <polygon points="16,22 24,25 18,30" fill="#4f46e5" />
          <polygon points="48,22 40,25 46,30" fill="#4f46e5" />
          <circle cx="25" cy="34" r="7.5" fill="#f8fafc" />
          <circle cx="39" cy="34" r="7.5" fill="#f8fafc" />
          <circle cx="25" cy="34" r="3.6" fill="#fbbf24" />
          <circle cx="39" cy="34" r="3.6" fill="#fbbf24" />
          <circle cx="25" cy="34" r="1.8" fill="#0f172a" />
          <circle cx="39" cy="34" r="1.8" fill="#0f172a" />
          <polygon points="32,37 29,43 35,43" fill="#f59e0b" />
        </svg>
      );
    case 'preset:panda':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-panda`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-panda)`} />
          <circle cx="19" cy="21" r="6.5" fill="#18181b" />
          <circle cx="45" cy="21" r="6.5" fill="#18181b" />
          <circle cx="32" cy="37" r="17" fill="#f8fafc" />
          <ellipse cx="25" cy="35" rx="4.5" ry="5.5" transform="rotate(-14 25 35)" fill="#18181b" />
          <ellipse cx="39" cy="35" rx="4.5" ry="5.5" transform="rotate(14 39 35)" fill="#18181b" />
          <circle cx="25.5" cy="34.5" r="1.6" fill="#ffffff" />
          <circle cx="38.5" cy="34.5" r="1.6" fill="#ffffff" />
          <ellipse cx="32" cy="41.5" rx="3" ry="2" fill="#18181b" />
          <path d="M29 45 Q32 47.5 35 45" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'preset:dragon':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-drg`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#065f46" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-drg)`} />
          <polygon points="20,13 24,25 16,24" fill="#fde047" />
          <polygon points="44,13 40,25 48,24" fill="#fde047" />
          <ellipse cx="32" cy="38" rx="17" ry="15" fill="#10b981" />
          <ellipse cx="32" cy="44" rx="12" ry="8" fill="#a7f3d0" />
          <circle cx="25" cy="33" r="2.7" fill="#fef08a" />
          <circle cx="39" cy="33" r="2.7" fill="#fef08a" />
          <circle cx="25" cy="33" r="1.3" fill="#064e3b" />
          <circle cx="39" cy="33" r="1.3" fill="#064e3b" />
          <circle cx="28.5" cy="42" r="1.3" fill="#047857" />
          <circle cx="35.5" cy="42" r="1.3" fill="#047857" />
        </svg>
      );
    case 'preset:bot':
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id={`${gp}-bot`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill={`url(#${gp}-bot)`} />
          <line x1="32" y1="11" x2="32" y2="19" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="10" r="3" fill="#22d3ee" />
          <rect x="14" y="19" width="36" height="29" rx="9" fill="#e2e8f0" />
          <rect x="19" y="25" width="26" height="14" rx="5" fill="#0f172a" />
          <circle cx="26" cy="32" r="2.8" fill="#00f0ff" />
          <circle cx="38" cy="32" r="2.8" fill="#00f0ff" />
          <path d="M25 43 L39 43" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
};

export interface PlayerAvatarProps {
  avatarUrl?: string | null;
  frameId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isLight: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 rounded-lg',
  sm: 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl',
  md: 'w-12 h-12 rounded-xl',
  lg: 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl',
  xl: 'w-20 h-20 rounded-2xl'
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  avatarUrl,
  frameId,
  size = 'md',
  isLight,
  className = ''
}) => {
  const rawId = useId();
  const gradPrefix = rawId.replace(/:/g, '');
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedAvatar = avatarUrl?.trim() || DEFAULT_AVATAR_URL;
  const frame = getFrameMeta(frameId || DEFAULT_AVATAR_FRAME);
  const frameClasses = isLight ? frame.previewRingLight : frame.previewRingDark;
  const showCustomImg =
    failedSrc !== resolvedAvatar &&
    !isPresetId(resolvedAvatar) &&
    resolvedAvatar.startsWith('data:image/');

  return (
    <div className={`relative inline-flex shrink-0 ${SIZE_CLASSES[size]} ${className}`}>
      <div className={`w-full h-full overflow-hidden rounded-[inherit] ${frameClasses}`}>
        {showCustomImg ? (
          <img
            src={resolvedAvatar}
            alt="Player avatar"
            onError={() => setFailedSrc(resolvedAvatar)}
            className="w-full h-full object-cover block"
          />
        ) : (
          renderPresetIllustration(isPresetId(resolvedAvatar) ? resolvedAvatar : 'preset:pilot', gradPrefix)
        )}
      </div>
      {frame.badgeText && size !== 'xs' && (
        <span
          className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded-md text-[8px] font-extrabold leading-tight shadow-sm ${
            frame.badgeColorClass ?? 'bg-amber-400 text-slate-950'
          }`}
        >
          {frame.badgeText}
        </span>
      )}
    </div>
  );
};

export type AvatarUploadErrorCode = 'INVALID_IMAGE' | 'FILE_TOO_LARGE' | 'PROCESS_FAILED';

export async function processUploadedAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('INVALID_IMAGE');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('PROCESS_FAILED'));
    };
    reader.onerror = () => reject(new Error('PROCESS_FAILED'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('INVALID_IMAGE'));
    el.src = dataUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('INVALID_IMAGE');

  const side = Math.min(srcW, srcH);
  const sx = Math.floor((srcW - side) / 2);
  const sy = Math.floor((srcH - side) / 2);

  const targetSize = 160;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PROCESS_FAILED');

  ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

  const candidates = [
    canvas.toDataURL('image/webp', 0.85),
    canvas.toDataURL('image/jpeg', 0.84),
    canvas.toDataURL('image/jpeg', 0.65)
  ];

  for (const out of candidates) {
    if (out.startsWith('data:image/') && out.length <= 115_000) {
      return out;
    }
  }
  throw new Error('FILE_TOO_LARGE');
}
