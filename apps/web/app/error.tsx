'use client';

type ErrorPageProps = {
  error: Error;
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="routeState">
      <section className="routeStateCard">
        <h1>Beklenmeyen Hata</h1>
        <p>{error.message || 'Uygulama beklenmeyen bir hatayla karsilasti.'}</p>
        <button type="button" onClick={reset}>
          Tekrar Dene
        </button>
      </section>
    </main>
  );
}
