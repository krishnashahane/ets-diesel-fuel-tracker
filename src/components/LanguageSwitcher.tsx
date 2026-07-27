'use client';
// In-app language selector, available to every signed-in role. Reuses the same
// 7-language list and storage as the login screen.
import { LANGS, t, type Lang } from '@/lib/i18n';
import { useLang, setLang } from '@/lib/useLang';

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const lang = useLang();
  return (
    <label className={`flex items-center gap-1 ${className}`}>
      <span className="sr-only">{t(lang, 'language')}</span>
      <span aria-hidden className="text-slate-400">🌐</span>
      <select
        aria-label={t(lang, 'language')}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
