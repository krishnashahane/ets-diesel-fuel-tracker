'use client';
// Shared client-side language state. Persists to localStorage (same key the
// login screen uses) and broadcasts changes so every mounted component — the
// sidebar, header, forms — re-renders in the chosen language instantly.
import { useEffect, useState } from 'react';
import { detectLang, isLang, STORAGE_KEY, type Lang } from './i18n';

const EVENT = 'sfm-lang-change';

export function setLang(l: Lang): void {
  try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  try { document.documentElement.lang = l; } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: l }));
}

export function useLang(): Lang {
  // Start at 'en' on both server and first client render to avoid hydration
  // mismatch; resolve the real choice after mount.
  const [lang, setL] = useState<Lang>('en');
  useEffect(() => {
    setL(detectLang());
    const onChange = (e: Event) => { const d = (e as CustomEvent).detail; if (isLang(d)) setL(d); };
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY && isLang(e.newValue)) setL(e.newValue); };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, []);
  return lang;
}
