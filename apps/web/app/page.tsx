'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Project = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type Ticket = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] =
    useState<Ticket['priority']>('MEDIUM');
  const [error, setError] = useState('');

  async function loadProjects() {
    const res = await fetch(`${API_URL}/projects`);
    const data = await res.json();
    setProjects(data);
    if (!projectId && data.length > 0) setProjectId(data[0].id);
  }

  async function loadTickets(pid?: string) {
    const target = pid ?? projectId;
    if (!target) return;
    const res = await fetch(`${API_URL}/tickets?projectId=${target}`);
    const data = await res.json();
    setTickets(data);
  }

  useEffect(() => {
    loadProjects().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTickets().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        key: projectKey.toUpperCase(),
        description: projectDesc || undefined,
      }),
    });
    if (!res.ok) {
      setError('Proje olusturulamadi');
      return;
    }
    setProjectName('');
    setProjectKey('');
    setProjectDesc('');
    await loadProjects();
  }

  async function onCreateTicket(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!projectId) {
      setError('Once proje secin');
      return;
    }
    const res = await fetch(`${API_URL}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        title: ticketTitle,
        description: ticketDesc || undefined,
        priority: ticketPriority,
      }),
    });
    if (!res.ok) {
      setError('Ticket olusturulamadi');
      return;
    }
    setTicketTitle('');
    setTicketDesc('');
    setTicketPriority('MEDIUM');
    await loadTickets(projectId);
  }

  async function moveStatus(id: string, status: Ticket['status']) {
    const res = await fetch(`${API_URL}/tickets/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setError('Durum guncellenemedi');
      return;
    }
    await loadTickets();
  }

  return (
    <main>
      <h1>Jira-lite Dashboard</h1>
      <p className="muted">
        Stack: NestJS + Prisma + PostgreSQL + Redis(BullMQ) + Next.js
      </p>
      {error && <p className="muted">{error}</p>}

      <section className="grid">
        <div className="panel">
          <h2>Proje Olustur</h2>
          <form onSubmit={onCreateProject}>
            <input
              placeholder="Proje adi"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
            <input
              placeholder="Key (ORN: APP)"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              required
            />
            <textarea
              placeholder="Aciklama"
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
            />
            <button type="submit">Olustur</button>
          </form>

          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <strong>
                  {p.key} - {p.name}
                </strong>
                <div className="muted">{p.description || '-'}</div>
                <button onClick={() => setProjectId(p.id)}>Sec</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Ticket Olustur</h2>
          <div className="muted">
            Secili proje: {selectedProject ? selectedProject.key : 'Yok'}
          </div>
          <form onSubmit={onCreateTicket}>
            <input
              placeholder="Ticket basligi"
              value={ticketTitle}
              onChange={(e) => setTicketTitle(e.target.value)}
              required
            />
            <textarea
              placeholder="Aciklama"
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
            />
            <select
              value={ticketPriority}
              onChange={(e) => setTicketPriority(e.target.value as Ticket['priority'])}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <button type="submit">Ekle</button>
          </form>

          <ul>
            {tickets.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                <div className="muted">
                  {t.status} | {t.priority}
                </div>
                <div>{t.description || '-'}</div>
                <div className="row">
                  <button onClick={() => moveStatus(t.id, 'IN_PROGRESS')}>
                    In Progress
                  </button>
                  <button onClick={() => moveStatus(t.id, 'IN_REVIEW')}>
                    In Review
                  </button>
                  <button onClick={() => moveStatus(t.id, 'DONE')}>Done</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
