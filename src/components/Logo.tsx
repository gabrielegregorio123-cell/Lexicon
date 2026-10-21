import React from 'react';

interface LogoProps {
  className?: string;
}

/**
 * LARES — Languages / Religions logo.
 */
export const Logo: React.FC<LogoProps> = ({ className = 'h-10' }) => (
  <span className="inline-flex items-center">
    <img
      src="/brand/lares-logo.png"
      alt="LARES — Languages, Religions"
      className={`${className} w-auto select-none`}
      draggable={false}
    />
  </span>
);
