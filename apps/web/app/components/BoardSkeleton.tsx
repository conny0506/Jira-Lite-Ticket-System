'use client';

const COLUMNS: { label: string; accent: string }[] = [
  { label: 'To Do', accent: '#23a4ff' },
  { label: 'In Progress', accent: '#f0b429' },
  { label: 'Done', accent: '#00d1b6' },
];

export function BoardSkeleton() {
  return (
    <div className="boardShell" aria-busy="true" aria-label="Yükleniyor">
      <div className="boardColumns">
        {COLUMNS.map((col, i) => (
          <section
            key={col.label}
            className="boardColumn boardSkeletonColumn"
            style={{ borderTop: `3px solid ${col.accent}` }}
          >
            <header className="boardColumnHeader">
              <span style={{ color: col.accent }}>{col.label}</span>
              <span className="boardColumnCount">—</span>
            </header>
            <div className="boardCardList">
              {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
                <div key={j} className="boardSkeletonCard">
                  <div className="boardSkeletonLine" style={{ width: '40%', height: 14 }} />
                  <div className="boardSkeletonLine" style={{ width: '85%', height: 12 }} />
                  <div className="boardSkeletonLine" style={{ width: '60%', height: 10 }} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
