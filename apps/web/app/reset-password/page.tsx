'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const NETWORK_ERROR_MESSAGE =
  'Sunucuya ulasilamadi. Lutfen baglantiyi ve API adresini kontrol edin.';

function parseApiMessage(raw: unknown) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const value = raw as { message?: unknown; errors?: unknown };
    if (Array.isArray(value.message)) {
      return value.message.filter((x) => typeof x === 'string').join(', ');
    }
    if (typeof value.message === 'string') return value.message;
    if (Array.isArray(value.errors)) {
      return value.errors.filter((x) => typeof x === 'string').join(', ');
    }
  }
  return '';
}

async function extractErrorMessage(res: Response) {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      return parseApiMessage(data) || `Istek basarisiz (${res.status})`;
    } catch {
      return `Istek basarisiz (${res.status})`;
    }
  }
  const text = await res.text();
  return text || `Istek basarisiz (${res.status})`;
}

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = useMemo(() => (params.get('token') ?? '').trim(), [params]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFieldError('');
    setError('');

    if (!token) {
      setFieldError('Sifirlama baglantisi gecersiz');
      return;
    }
    if (newPassword.length < 6) {
      setFieldError('Yeni sifre en az 6 karakter olmali');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError('Sifre tekrar alani eslesmiyor');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message =
        err instanceof TypeError ? NETWORK_ERROR_MESSAGE : (err as Error).message;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app">
      <section className="panel loginPanel">
        <h1>Sifreyi Sifirla</h1>
        <p className="muted">Baglantiniz dogrulanirsa yeni sifrenizi kaydedebilirsiniz.</p>
        {error && <p className="errorBox">{error}</p>}
        {success ? (
          <div className="formBlock">
            <p className="successBox">Sifreniz guncellendi. Simdi giris yapabilirsiniz.</p>
            <Link href="/" className="inlineLink">
              Giris ekranina don
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="formBlock">
            <input
              type="password"
              placeholder="Yeni sifre"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setFieldError('');
              }}
              required
            />
            <input
              type="password"
              placeholder="Yeni sifre tekrar"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldError('');
              }}
              required
            />
            {fieldError && <p className="fieldError">{fieldError}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Yeni sifreyi kaydet'}
            </button>
            <Link href="/" className="inlineLink">
              Girise geri don
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
