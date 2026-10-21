import React, { useState } from 'react';
import type { Language } from '../i18n/translations.ts';
import { LANGUAGES, tr } from '../i18n/translations.ts';
import { passwordOk, unlock } from '../lib/gate.ts';
import { Logo } from './Logo.tsx';

interface Props {
  lang: Language;
  onLang: (l: Language) => void;
  onUnlock: () => void;
}

/** Temporary password page shown before the site (see src/lib/gate.ts). */
export const AccessGate: React.FC<Props> = ({ lang, onLang, onUnlock }) => {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-10 text-center">
        <Logo className="h-20" />
        <div className="space-y-2">
          <p className="eyebrow">{tr(lang, 'Accesso riservato', 'Restricted access', 'Dostęp ograniczony')}</p>
          <h1 className="text-4xl font-medium leading-tight">{tr(lang, 'Il sito non è ancora pubblico', 'The site is not public yet', 'Serwis nie jest jeszcze publiczny')}</h1>
          <p className="text-lg italic text-muted">{tr(lang, 'Inserisci la password per entrare.', 'Enter the password to continue.', 'Wpisz hasło, aby wejść.')}</p>
        </div>
        <form
          className="w-full space-y-5 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordOk(value)) {
              unlock();
              onUnlock();
            } else {
              setWrong(true);
            }
          }}
        >
          <label className="block">
            <span className="label">{tr(lang, 'Password', 'Password', 'Hasło')}</span>
            <input
              type="password"
              className="field"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setWrong(false);
              }}
              autoFocus
              autoComplete="current-password"
              aria-invalid={wrong}
            />
          </label>
          {wrong && (
            <p role="alert" className="text-danger">
              {tr(lang, 'Password non corretta.', 'Incorrect password.', 'Nieprawidłowe hasło.')}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full justify-center !py-3" disabled={!value.trim()}>
            {tr(lang, 'Entra', 'Enter', 'Wejdź')}
          </button>
        </form>
        <div className="flex items-center gap-3 text-faint">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => onLang(l.code)}
              aria-pressed={lang === l.code}
              className={`px-1 uppercase tracking-[0.1em] transition-colors hover:text-brand ${lang === l.code ? 'text-ink underline decoration-brand decoration-1 underline-offset-4' : ''}`}
            >
              {l.code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
