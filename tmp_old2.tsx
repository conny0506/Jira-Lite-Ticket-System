'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type TeamRole = 'MEMBER' | 'BOARD' | 'CAPTAIN';
type TicketStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
};

type Project = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  assignments: Array<{ member: TeamMember }>;
};

type Submission = {
  id: string;
  fileName: string;
  note?: string | null;
  createdAt: string;
  submittedBy: Pick<TeamMember, 'id' | 'name' | 'role'>;
};

type Ticket = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignees: Array<{ member: TeamMember }>;
  submissions: Submission[];
};

type UploadDraft = {
  note: string;
  file: File | null;
};

type AuthBundle = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: TeamMember;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const STATUS_LIST: TicketStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const STATUS_LABELS: Record<TicketStatus, string> = {
  TODO: 'Backlog',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

const ROLE_LABELS: Record<TeamRole, string> = {
  MEMBER: 'Uye',
  BOARD: 'Yonetim Kurulu',
  CAPTAIN: 'Kaptan',
};

export default function HomePage() {
  const [authBundle, setAuthBundle] = useState<AuthBundle | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('MEMBER');

  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectAssignees, setProjectAssignees] = useState<string[]>([]);

  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('MEDIUM');
  const [ticketAssignees, setTicketAssignees] = useState<string[]>([]);

  const [uploadDrafts, setUploadDrafts] = useState<Record<string, UploadDraft>>({});
  const [refreshingToken, setRefreshingToken] = useState(false);

  const currentUser = authBundle?.user ?? null;
  const isCaptain = currentUser?.role === 'CAPTAIN';
  const selectedProject = projects.find((p) => p.id === projectId);

  const grouped = useMemo(() => {
    return STATUS_LIST.reduce(
      (acc, status) => {
        acc[status] = tickets.filter((t) => t.status === status);
        return acc;
      },
      {
        TODO: [] as Ticket[],
        IN_PROGRESS: [] as Ticket[],
        IN_REVIEW: [] as Ticket[],
        DONE: [] as Ticket[],
      },
    );
  }, [tickets]);

  async function refreshAuthToken(current: AuthBundle) {
    setRefreshingToken(true);
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      setRefreshingToken(false);
      throw new Error(await res.text());
    }
    const next = (await res.json()) as AuthBundle;
    localStorage.setItem('jira_auth', JSON.stringify(next));
    setAuthBundle(next);
    setRefreshingToken(false);
    return next;
  }

  async function apiFetch(path: string, init?: RequestInit, retried = false) {
    if (!authBundle) throw new Error('Login required');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${authBundle.accessToken}`,
      ...(init?.headers ? (init.headers as Record<string, string>) : {}),
    };
    const res = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (res.status === 401 && !retried) {
      const next = await refreshAuthToken(authBundle);
      return apiFetch(
        path,
        {
          ...init,
          headers: {
            ...(init?.headers ? (init.headers as Record<string, string>) : {}),
            Authorization: `Bearer ${next.accessToken}`,
          },
        },
        true,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function loadAll(pid?: string) {
    if (!currentUser) return;
    const [projectData, memberData] = await Promise.all([
      apiFetch('/projects'),
      apiFetch('/team-members?activeOnly=true'),
    ]);
    setProjects(projectData);
    setTeamMembers(memberData);

    const target = pid ?? projectId ?? projectData[0]?.id;
    if (target) {
      setProjectId(target);
      const ticketData = await apiFetch(`/tickets?projectId=${target}`);
      setTickets(ticketData);
    } else {
      setTickets([]);
    }
  }

  useEffect(() => {
    const cached = localStorage.getItem('jira_auth');
    if (!cached) {
      setLoading(false);
      return;
    }
    const parsed = JSON.parse(cached) as AuthBundle;
    setAuthBundle(parsed);
  }, []);

  useEffect(() => {
    if (!authBundle) return;
    Promise.resolve()
      .then(() => loadAll())
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBundle]);

  useEffect(() => {
    if (!authBundle) return;
    const timer = setInterval(async () => {
      if (refreshingToken) return;
      const expMs = new Date(authBundle.accessTokenExpiresAt).getTime();
      const now = Date.now();
      if (expMs - now <= 60_000) {
        try {
          await refreshAuthToken(authBundle);
        } catch {
          await logout();
        }
      }
    }, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBundle, refreshingToken]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      const bundle = (await res.json()) as AuthBundle;
      localStorage.setItem('jira_auth', JSON.stringify(bundle));
      setAuthBundle(bundle);
      setLoginEmail('');
      setLoginPassword('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    try {
      if (authBundle) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: authBundle.refreshToken }),
        });
      }
    } catch {}
    localStorage.removeItem('jira_auth');
    setAuthBundle(null);
    setProjects([]);
    setTickets([]);
    setTeamMembers([]);
    setProjectId('');
  }

  async function createMember(e: FormEvent) {
    e.preventDefault();
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch('/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: memberName,
          email: memberEmail,
          password: memberPassword,
          role: memberRole,
        }),
      });
      setMemberName('');
      setMemberEmail('');
      setMemberPassword('');
      setMemberRole('MEMBER');
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deactivateMember(id: string) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/team-members/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          key: projectKey.toUpperCase(),
          description: projectDesc || undefined,
          assigneeIds: projectAssignees,
        }),
      });
      setProjectName('');
      setProjectKey('');
      setProjectDesc('');
      setProjectAssignees([]);
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function updateProjectAssignees(project: Project, assigneeIds: string[]) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/projects/${project.id}/assignees`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeIds }),
      });
      await loadAll(project.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteProject(id: string) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/projects/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    if (!isCaptain || !projectId) return;
    setError('');
    try {
      await apiFetch('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: ticketTitle,
          description: ticketDesc || undefined,
          priority: ticketPriority,
          assigneeIds: ticketAssignees,
        }),
      });
      setTicketTitle('');
      setTicketDesc('');
      setTicketPriority('MEDIUM');
      setTicketAssignees([]);
      await loadAll(projectId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function updateTicketAssignees(ticket: Ticket, assigneeIds: string[]) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/tickets/${ticket.id}/assignee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeIds }),
      });
      await loadAll(ticket.projectId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteTicket(ticket: Ticket) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/tickets/${ticket.id}`, { method: 'DELETE' });
      await loadAll(ticket.projectId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function moveStatus(ticket: Ticket, status: TicketStatus) {
    setError('');
    try {
      await apiFetch(`/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadAll(ticket.projectId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setUpload(ticketId: string, patch: Partial<UploadDraft>) {
    setUploadDrafts((prev) => ({
      ...prev,
      [ticketId]: {
        note: prev[ticketId]?.note ?? '',
        file: prev[ticketId]?.file ?? null,
        ...patch,
      },
    }));
  }

  async function submitFile(ticket: Ticket) {
    const draft = uploadDrafts[ticket.id];
    if (!draft?.file || !currentUser) {
      setError('Dosya secmeden teslim gonderemezsin');
      return;
    }
    setError('');
    try {
      const form = new FormData();
      form.set('submittedById', currentUser.id);
      form.set('note', draft.note);
      form.set('file', draft.file);
      await apiFetch(`/tickets/${ticket.id}/submissions`, {
        method: 'POST',
        body: form,
      });
      setUpload(ticket.id, { note: '', file: null });
      await loadAll(ticket.projectId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function downloadSubmission(submission: Submission) {
    if (!authBundle) return;
    setError('');
    try {
      const res = await fetch(
        `${API_URL}/tickets/submissions/${submission.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${authBundle.accessToken}`,
          },
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = submission.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!currentUser) {
    return (
      <main className="app">
        <section className="panel loginPanel">
          <h1>Ulgen AR-GE Login</h1>
          <p className="muted">Uyeler e-posta ve sifre ile giris yapar.</p>
          <p className="muted">
            Ilk kurulum kaptan: captain@ulgen.local / 1234
          </p>
          {error && <p className="errorBox">{error}</p>}
          <form onSubmit={onLogin} className="formBlock">
            <input
              placeholder="E-posta"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Sifre"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            <button type="submit">Giris Yap</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Ulgen AR-GE Task Hub</p>
          <h1>Role-Based Project Workspace</h1>
          <p className="muted">
            Giris yapan: {currentUser.name} ({ROLE_LABELS[currentUser.role]})
          </p>
        </div>
        <div className="stats">
          <article className="statCard">
            <span>Gorunen Proje</span>
            <strong>{projects.length}</strong>
          </article>
          <article className="statCard">
            <span>Secili Ticket</span>
            <strong>{tickets.length}</strong>
          </article>
          <article className="statCard">
            <span>Yetki</span>
            <strong>{isCaptain ? 'Captain' : 'Member'}</strong>
          </article>
        </div>
      </section>

      {error && <p className="errorBox">{error}</p>}

      <section className="workspace">
        <aside className="sidebar panel">
          <div className="panelHead">
            <h2>Projeler</h2>
            <button type="button" onClick={logout}>
              Cikis
            </button>
          </div>

          {isCaptain && (
            <form onSubmit={createProject} className="formBlock">
              <input
                placeholder="Proje adi"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
              />
              <input
                placeholder="Key"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                required
              />
              <textarea
                placeholder="Aciklama"
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
              />
              <select
                multiple
                value={projectAssignees}
                onChange={(e) =>
                  setProjectAssignees(
                    Array.from(e.currentTarget.selectedOptions).map((o) => o.value),
                  )
                }
              >
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({ROLE_LABELS[m.role]})
                  </option>
                ))}
              </select>
              <button type="submit">Proje Olustur</button>
            </form>
          )}

          <ul className="projectList">
            {projects.map((p) => (
              <li key={p.id} className={p.id === projectId ? 'active' : ''}>
                <button type="button" className="projectBtn" onClick={() => loadAll(p.id)}>
                  <strong>
                    {p.key} - {p.name}
                  </strong>
                  <small>{p.description || '-'}</small>
                  <small>
                    Atananlar:{' '}
                    {p.assignments.length > 0
                      ? p.assignments.map((x) => x.member.name).join(', ')
                      : 'Yok'}
                  </small>
                </button>
                {isCaptain && (
                  <div className="projectActions">
                    <select
                      multiple
                      value={p.assignments.map((x) => x.member.id)}
                      onChange={(e) =>
                        updateProjectAssignees(
                          p,
                          Array.from(e.currentTarget.selectedOptions).map((o) => o.value),
                        )
                      }
                    >
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => deleteProject(p.id)}>
                      Projeyi Sil
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {isCaptain && (
            <div className="teamBlock">
              <div className="panelHead">
                <h2>Takim Yonetimi</h2>
              </div>
              <form onSubmit={createMember} className="formBlock">
                <input
                  placeholder="Ad Soyad"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  required
                />
                <input
                  placeholder="E-posta"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Sifre"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                  required
                />
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as TeamRole)}
                >
                  {(['MEMBER', 'BOARD', 'CAPTAIN'] as TeamRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <button type="submit">Uye Ekle</button>
              </form>

              <ul className="memberList">
                {teamMembers.map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <div className="muted">{m.email}</div>
                      <span className={`roleTag role-${m.role.toLowerCase()}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    </div>
                    <button type="button" onClick={() => deactivateMember(m.id)}>
                      Pasiflestir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className="board panel">
          <div className="panelHead">
            <h2>{selectedProject ? `${selectedProject.key} Board` : 'Ticket Board'}</h2>
            <button type="button" onClick={() => loadAll(projectId)}>
              Yenile
            </button>
          </div>

          {isCaptain && (
            <form onSubmit={createTicket} className="ticketForm">
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
                onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select
                multiple
                value={ticketAssignees}
                onChange={(e) =>
                  setTicketAssignees(
                    Array.from(e.currentTarget.selectedOptions).map((o) => o.value),
                  )
                }
              >
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={!projectId}>
                Ticket Olustur
              </button>
            </form>
          )}

          {loading ? (
            <p className="muted">Yukleniyor...</p>
          ) : (
            <div className="columns">
              {STATUS_LIST.map((status) => (
                <section key={status} className="column">
                  <header>
                    <h3>{STATUS_LABELS[status]}</h3>
                    <span>{grouped[status].length}</span>
                  </header>
                  <div className="ticketStack">
                    {grouped[status].map((ticket) => (
                      <article key={ticket.id} className="ticketCard">
                        <strong>{ticket.title}</strong>
                        <p>{ticket.description || '-'}</p>
                        <div className="ticketMeta">
                          <span>{ticket.priority}</span>
                          <select
                            value={ticket.status}
                            onChange={(e) =>
                              moveStatus(ticket, e.target.value as TicketStatus)
                            }
                          >
                            {STATUS_LIST.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="muted">
                          Atananlar:{' '}
                          {ticket.assignees.length > 0
                            ? ticket.assignees.map((x) => x.member.name).join(', ')
                            : 'Yok'}
                        </p>
                        {isCaptain && (
                          <div className="projectActions">
                            <select
                              multiple
                              value={ticket.assignees.map((x) => x.member.id)}
                              onChange={(e) =>
                                updateTicketAssignees(
                                  ticket,
                                  Array.from(e.currentTarget.selectedOptions).map(
                                    (o) => o.value,
                                  ),
                                )
                              }
                            >
                              {teamMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => deleteTicket(ticket)}>
                              Ticket Sil
                            </button>
                          </div>
                        )}

                        <div className="submissionBox">
                          <h4>Teslim Dosyasi</h4>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.ppt,.pptx"
                            onChange={(e) =>
                              setUpload(ticket.id, {
                                file:
                                  e.currentTarget.files && e.currentTarget.files[0]
                                    ? e.currentTarget.files[0]
                                    : null,
                              })
                            }
                          />
                          <input
                            placeholder="Not"
                            value={uploadDrafts[ticket.id]?.note ?? ''}
                            onChange={(e) =>
                              setUpload(ticket.id, { note: e.target.value })
                            }
                          />
                          <button type="button" onClick={() => submitFile(ticket)}>
                            Teslim Gonder
                          </button>
                          <ul className="submissionList">
                            {ticket.submissions.map((s) => (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  className="linkButton"
                                  onClick={() => downloadSubmission(s)}
                                >
                                  {s.fileName}
                                </button>
                                <span className="muted">
                                  {s.submittedBy.name} -{' '}
                                  {new Date(s.createdAt).toLocaleString('tr-TR')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
