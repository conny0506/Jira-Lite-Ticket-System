'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const FORGOT_PASSWORD_TIMEOUT_MS = 15000;
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFieldError('');
    setError('');
    setSuccess(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      setFieldError('Gecerli bir e-posta giriniz');
      return;
    }

    try {
      setSubmitting(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FORGOT_PASSWORD_TIMEOUT_MS);
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      setSuccess(true);
      setEmail('');
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Sifre sifirlama istegi zaman asimina ugradi. Lütfen tekrar deneyin.'
          : err instanceof TypeError
            ? NETWORK_ERROR_MESSAGE
            : (err as Error).message;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app">
      <section className="panel loginPanel">
        <h1>Sifremi Unuttum</h1>
        <p className="muted">Kayitli e-posta adresinizi girin, sifre sifirlama linki gonderelim.</p>
        {error && <p className="errorBox">{error}</p>}
        {success && (
          <p className="successBox">
            Eger e-posta kayitliysa sifre sifirlama baglantisi gonderildi.
          </p>
        )}
        <form onSubmit={onSubmit} className="formBlock">
          <input
            placeholder="Kayitli e-posta"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError('');
            }}
            required
          />
          {fieldError && <p className="fieldError">{fieldError}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Baglanti gonderiliyor...' : 'Sifre sifirlama baglantisi gonder'}
          </button>
        </form>
        <Link href="/" className="inlineLink">
          Giris sayfasina don
        </Link>
      </section>
    </main>
  );
}
