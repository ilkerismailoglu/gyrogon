import React, { useState } from 'react';

interface TooltipProps {
  label: string;
  isLight: boolean;
  position?: 'top' | 'bottom';
  align?: 'center' | 'right' | 'left';
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  isLight,
  position = 'bottom',
  align = 'center',
  children
}) => {
  const [visible, setVisible] = useState(false);

  const posClass = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'left'
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2';

  const styleClass = isLight
    ? 'bg-[#2c3e50] text-[#ecf0f1] shadow-lg'
    : 'bg-[#0B1222] text-slate-100 border border-cyan-400/35 shadow-[0_6px_20px_rgba(0,0,0,0.6)]';

  return (
    <div
      className="relative inline-flex"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setVisible(true);
      }}
      onPointerLeave={() => setVisible(false)}
      onPointerDown={() => setVisible(false)}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${posClass} ${alignClass} z-50 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all duration-150 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } ${styleClass}`}
      >
        {label}
      </span>
    </div>
  );
};
