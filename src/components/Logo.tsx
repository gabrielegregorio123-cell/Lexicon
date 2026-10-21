import React from 'react';
import { asset } from '../utils/endpoints.ts';

interface LogoProps {
  className?: string;
}

/**
 * LARES — Languages / Religions logo.
 */
export const Logo: React.FC<LogoProps> = ({ className = 'h-10' }) => (
  <span className="inline-flex items-center">
    <img
      src={asset('brand/lares-logo.png')}
      alt="LARES — Languages, Religions"
      className={`${className} w-auto select-none`}
      draggable={false}
    />
  </span>
);
