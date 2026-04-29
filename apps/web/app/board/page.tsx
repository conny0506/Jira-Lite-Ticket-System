'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BoardView } from '../components/BoardView';
import type { BoardAuthBundle } from '../lib/boardApi';

type Theme = 'dark' | 'light';

export default function BoardPage() {
  const router = useRouter();
  const [bundle, setBundle] = useState<BoardAuthBundle | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    document.body.setAttribute('data-page', 'board');
    return () => document.body.removeAttribute('data-page');
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem('jira_theme') as Theme | null) ?? 'dark';
    setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
    localStorage.setItem('jira_theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jira_auth');
      if (!raw) {
        router.replace('/');
        return;
      }
      const parsed = JSON.parse(raw) as BoardAuthBundle;
      if (!parsed?.accessToken || !parsed?.user?.id) {
        router.replace('/');
        return;
      }
      setBundle(parsed);
      setReadOnly(parsed.user.role !== 'CAPTAIN' && parsed.user.role !== 'BOARD');
      setAuthChecked(true);
    } catch {
      router.replace('/');
    }
  }, [router]);

  function handleAuthError() {
    localStorage.removeItem('jira_auth');
    router.replace('/');
  }

  if (!authChecked || !bundle) {
    return (
      <main className="boardRoot">
        <p className="muted" style={{ textAlign: 'center', padding: 60 }}>Yukleniyor...</p>
      </main>
    );
  }

  return (
    <main className="boardRoot">
      <header className="boardTopBar">
        <Link href="/" className="boardBackLink">← Panele Don</Link>
        <h1 className="boardTopTitle">Odak Panosu</h1>
        <div className="boardTopRight">
          {readOnly && <span className="boardReadOnlyBadge">Goruntuleme modu</span>}
          <button
            type="button"
            className="boardThemeToggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Tema değiştir"
            title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ y: -16, opacity: 0, rotate: -90 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: 16, opacity: 0, rotate: 90 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                style={{ display: 'inline-block' }}
              >
                {theme === 'dark' ? '☀' : '☾'}
              </motion.span>
            </AnimatePresence>
          </button>
          <span className="boardUserAvatar" title={bundle.user.name}>
            {bundle.user.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>
      <BoardView bundle={bundle} readOnly={readOnly} onAuthError={handleAuthError} />
    </main>
  );
}
