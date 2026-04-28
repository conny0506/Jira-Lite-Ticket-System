'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BoardView } from '../components/BoardView';
import type { BoardAuthBundle } from '../lib/boardApi';

export default function BoardPage() {
  const router = useRouter();
  const [bundle, setBundle] = useState<BoardAuthBundle | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    document.body.setAttribute('data-page', 'board');
    return () => document.body.removeAttribute('data-page');
  }, []);

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
          <span className="boardUserAvatar" title={bundle.user.name}>
            {bundle.user.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </header>
      <BoardView bundle={bundle} readOnly={readOnly} onAuthError={handleAuthError} />
    </main>
  );
}
