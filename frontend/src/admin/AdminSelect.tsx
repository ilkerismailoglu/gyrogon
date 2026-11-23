import { ChevronDown } from 'lucide-react';
import React from 'react';

interface AdminSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

/** Custom-styled admin select with breathing room before a non-flush ChevronDown indicator. */
export const AdminSelect: React.FC<AdminSelectProps> = ({
  wrapperClassName = 'inline-block',
  className = '',
  children,
  ...props
}) => (
  <div className={`relative ${wrapperClassName}`}>
    <select
      {...props}
      className={`appearance-none cursor-pointer pr-8 [&>option]:bg-slate-900 [&>option]:text-slate-100 ${className}`}
    >
      {children}
    </select>
    <ChevronDown
      className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
      aria-hidden="true"
    />
  </div>
);
