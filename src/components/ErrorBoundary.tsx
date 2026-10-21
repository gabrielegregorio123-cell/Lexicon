import React from 'react';
import type { Language } from '../i18n/translations.ts';
import { tr } from '../i18n/translations.ts';

interface Props {
  lang: Language;
  /** Changing this (e.g. the current route) clears a previous error. */
  resetKey: string;
  children: React.ReactNode;
}

/** A rendering bug in one page must not blank the whole app. */
export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ui]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { lang } = this.props;
    return (
      <div className="card mx-auto my-16 max-w-lg space-y-3 p-6">
        <h2 className="text-2xl font-medium">{tr(lang, 'Qualcosa è andato storto', 'Something went wrong', 'Coś poszło nie tak')}</h2>
        <p className="text-muted">
          {tr(lang, 'Questa pagina non si è caricata correttamente. Il resto del sito funziona.', 'This page failed to render. The rest of the site still works.', 'Ta strona nie wyświetliła się poprawnie. Reszta serwisu działa.')}
        </p>
        <div className="flex gap-3">
          <a href="#/" className="btn">
            {tr(lang, 'Torna alla home', 'Back to home', 'Wróć na stronę główną')}
          </a>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {tr(lang, 'Ricarica', 'Reload', 'Odśwież')}
          </button>
        </div>
      </div>
    );
  }
}
