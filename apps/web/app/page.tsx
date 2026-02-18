'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

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
  createdAt?: string;
  status: TicketStatus;
  priority: TicketPriority;
  completedAt?: string | null;
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
  user: TeamMember;
};

type CaptainTab = 'overview' | 'team' | 'tasks' | 'submissions';
type MemberTab = 'my_tasks' | 'my_submissions' | 'timeline';
type ToastItem = { id: number; type: 'success' | 'error'; message: string };
type NotificationItem = ToastItem & { createdAt: string };
type IntroStage = 'none' | 'terminal' | 'quote';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TYPEWRITER_CHARS_PER_SECOND = 120;
const QUOTE_ROTATE_MS = 5000;
const FORGOT_PASSWORD_TIMEOUT_MS = 15000;
const NETWORK_ERROR_MESSAGE = 'Sunucuya ulasilamadi. Lutfen baglantiyi ve API adresini kontrol edin.';
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx']);
const STATUS_LIST: TicketStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const STATUS_LABELS: Record<TicketStatus, string> = {
  TODO: 'Beklemede',
  IN_PROGRESS: 'Devam Ediyor',
  IN_REVIEW: 'İncelemede',
  DONE: 'Tamamlandı',
};

const ROLE_LABELS: Record<TeamRole, string> = {
  MEMBER: 'Üye',
  BOARD: 'Yönetim Kurulu',
  CAPTAIN: 'Kaptan',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

const SUCCESS_QUOTES = [
  'Disiplinli ilerleme, günlük motivasyondan daha güçlüdür.',
  'Küçük ama sürekli adımlar, büyük sonuçlar üretir.',
  'Mükemmeli bekleme, bugün başla ve geliştir.',
  'Odaklandığın iş, gelecekteki standardını belirler.',
  'Başarı tesadüf değil, tekrarlanan doğru davranıştır.',
];

function pickNextQuote(previousQuote: string) {
  if (SUCCESS_QUOTES.length < 2) return SUCCESS_QUOTES[0] ?? previousQuote;
  let next = previousQuote;
  while (next === previousQuote) {
    next = SUCCESS_QUOTES[Math.floor(Math.random() * SUCCESS_QUOTES.length)];
  }
  return next;
}

export default function HomePage() {
  const [authBundle, setAuthBundle] = useState<AuthBundle | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loginFieldError, setLoginFieldError] = useState('');
  const [memberFieldError, setMemberFieldError] = useState('');
  const [ticketFieldError, setTicketFieldError] = useState('');
  const [uploadFieldErrors, setUploadFieldErrors] = useState<Record<string, string>>({});
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [uploadingTicketId, setUploadingTicketId] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotFieldError, setForgotFieldError] = useState('');
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('MEMBER');

  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('MEDIUM');
  const [ticketAssignees, setTicketAssignees] = useState<string[]>([]);

  const [uploadDrafts, setUploadDrafts] = useState<Record<string, UploadDraft>>({});
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [captainTab, setCaptainTab] = useState<CaptainTab>('overview');
  const [memberTab, setMemberTab] = useState<MemberTab>('my_tasks');
  const [taskLayout, setTaskLayout] = useState<'board' | 'list'>('board');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamRoleFilter, setTeamRoleFilter] = useState<'ALL' | TeamRole>('ALL');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] =
    useState<'ALL' | TicketStatus>('ALL');
  const [taskPriorityFilter, setTaskPriorityFilter] =
    useState<'ALL' | TicketPriority>('ALL');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<'ALL' | string>('ALL');
  const [dragTicketId, setDragTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);
  const [isBoardDragging, setIsBoardDragging] = useState(false);
  const [dropPulseTicketId, setDropPulseTicketId] = useState<string | null>(null);
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionByFilter, setSubmissionByFilter] = useState<'ALL' | string>('ALL');
  const [submissionProjectFilter, setSubmissionProjectFilter] =
    useState<'ALL' | string>('ALL');
  const [submissionStartDate, setSubmissionStartDate] = useState('');
  const [submissionEndDate, setSubmissionEndDate] = useState('');
  const [memberTaskSearch, setMemberTaskSearch] = useState('');
  const [memberSubmissionSearch, setMemberSubmissionSearch] = useState('');
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationItem[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'ALL' | 'success' | 'error'>(
    'ALL',
  );
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<TicketStatus>('IN_PROGRESS');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [captainMetricsStart, setCaptainMetricsStart] = useState('');
  const [captainMetricsEnd, setCaptainMetricsEnd] = useState('');
  const [introStage, setIntroStage] = useState<IntroStage>('none');
  const [introQuote, setIntroQuote] = useState(SUCCESS_QUOTES[0]);
  const [introTypedChars, setIntroTypedChars] = useState(0);
  const toastIdRef = useRef(1);

  const currentUser = authBundle?.user ?? null;
  const isCaptain = currentUser?.role === 'CAPTAIN';
  const systemProject = projects.find((p) => p.key === 'ULGEN-SYSTEM') ?? projects[0];
  const filteredTeamMembers = teamMembers.filter((m) => {
    const bySearch =
      m.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(teamSearch.toLowerCase());
    const byRole = teamRoleFilter === 'ALL' || m.role === teamRoleFilter;
    return bySearch && byRole;
  });

  const filteredSelectedProjectTickets = tickets.filter((t) => {
    const search = taskSearch.trim().toLowerCase();
    const bySearch =
      search.length === 0 ||
      t.title.toLowerCase().includes(search) ||
      (t.description ?? '').toLowerCase().includes(search);
    const byStatus = taskStatusFilter === 'ALL' || t.status === taskStatusFilter;
    const byPriority =
      taskPriorityFilter === 'ALL' || t.priority === taskPriorityFilter;
    const byAssignee =
      taskAssigneeFilter === 'ALL' ||
      t.assignees.some((x) => x.member.id === taskAssigneeFilter);
    return bySearch && byStatus && byPriority && byAssignee;
  });

  const visibleTicketIds = useMemo(
    () => filteredSelectedProjectTickets.map((t) => t.id),
    [filteredSelectedProjectTickets],
  );

  const areAllVisibleSelected =
    visibleTicketIds.length > 0 &&
    visibleTicketIds.every((id) => selectedTicketIds.includes(id));

  const grouped = useMemo(() => {
    return STATUS_LIST.reduce(
      (acc, status) => {
        acc[status] = filteredSelectedProjectTickets.filter((t) => t.status === status);
        return acc;
      },
      {
        TODO: [] as Ticket[],
        IN_PROGRESS: [] as Ticket[],
        IN_REVIEW: [] as Ticket[],
        DONE: [] as Ticket[],
      },
    );
  }, [filteredSelectedProjectTickets]);

  const myTickets = useMemo(() => {
    if (!currentUser) return [] as Ticket[];
    return tickets
      .filter((ticket) =>
      ticket.assignees.some((x) => x.member.id === currentUser.id),
      )
      .filter((ticket) =>
        ticket.title.toLowerCase().includes(memberTaskSearch.toLowerCase()),
      );
  }, [tickets, currentUser, memberTaskSearch]);

  const allSubmissions = useMemo(
    () =>
      tickets.flatMap((ticket) =>
        ticket.submissions.map((submission) => ({
          submission,
          ticket,
        })),
      ),
    [tickets],
  );

  const mySubmissions = useMemo(() => {
    if (!currentUser) return [] as Array<{ submission: Submission; ticket: Ticket }>;
    return allSubmissions
      .filter((x) => x.submission.submittedBy.id === currentUser.id)
      .filter((x) =>
        x.submission.fileName
          .toLowerCase()
          .includes(memberSubmissionSearch.toLowerCase()),
      );
  }, [allSubmissions, currentUser, memberSubmissionSearch]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const myActiveTaskCount = useMemo(() => {
    if (!currentUser) return 0;
    return tickets.filter(
      (ticket) =>
        ticket.status !== 'DONE' &&
        ticket.assignees.some((x) => x.member.id === currentUser.id),
    ).length;
  }, [tickets, currentUser]);

  const myTodaySubmissionCount = useMemo(() => {
    if (!currentUser) return 0;
    return allSubmissions.filter(
      ({ submission }) =>
        submission.submittedBy.id === currentUser.id &&
        new Date(submission.createdAt).getTime() >= todayStart.getTime(),
    ).length;
  }, [allSubmissions, currentUser, todayStart]);

  const captainOpenTaskCount = useMemo(
    () => tickets.filter((x) => x.status !== 'DONE').length,
    [tickets],
  );

  const captainTrendLast7 = useMemo(() => {
    const start = captainMetricsStart ? new Date(`${captainMetricsStart}T00:00:00`) : null;
    const end = captainMetricsEnd ? new Date(`${captainMetricsEnd}T23:59:59.999`) : null;
    const days: Date[] = [];
    if (start && end && start <= end) {
      const cursor = new Date(start);
      while (cursor <= end && days.length < 31) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      for (let idx = 0; idx < 7; idx += 1) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - (6 - idx));
        days.push(d);
      }
    }
    return days.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const doneCount = tickets.filter((t) => {
        if (t.status !== 'DONE' || !t.completedAt) return false;
        return t.completedAt.slice(0, 10) === key;
      }).length;
      return { key, label: day.toLocaleDateString('tr-TR', { weekday: 'short' }), doneCount };
    });
  }, [tickets, captainMetricsStart, captainMetricsEnd]);

  const captainCriticalTickets = useMemo(
    () =>
      tickets
        .filter((t) => t.status !== 'DONE' && t.priority === 'CRITICAL')
        .slice(0, 5),
    [tickets],
  );

  const filteredNotificationHistory = useMemo(() => {
    if (notificationFilter === 'ALL') return notificationHistory;
    return notificationHistory.filter((n) => n.type === notificationFilter);
  }, [notificationFilter, notificationHistory]);

  const introInsights = useMemo(() => {
    if (!currentUser) return [] as string[];

    if (isCaptain) {
      const openTickets = tickets.filter((x) => x.status !== 'DONE');
      const unassignedOpen = openTickets.filter((x) => x.assignees.length === 0).length;
      const criticalOpen = openTickets.filter((x) => x.priority === 'CRITICAL').length;
      const reviewCount = openTickets.filter((x) => x.status === 'IN_REVIEW').length;
      const doneToday = tickets.filter(
        (x) =>
          x.status === 'DONE' &&
          x.completedAt &&
          new Date(x.completedAt).getTime() >= todayStart.getTime(),
      ).length;

      return [
        `Öneri: ${criticalOpen} kritik görev için gün başında kısa plan yap.`,
        `Öneri: ${unassignedOpen} atanmamış açık görev var, sahiplik belirle.`,
        `Öneri: İncelemede ${reviewCount} görev var, akşamdan önce netleştir.`,
        `İvme: Bugün ${doneToday} görev tamamlandı.`,
      ];
    }

    const myOpen = tickets.filter(
      (x) =>
        x.status !== 'DONE' &&
        x.assignees.some((a) => a.member.id === currentUser.id),
    );
    const myCritical = myOpen.filter((x) => x.priority === 'CRITICAL').length;
    const myReview = myOpen.filter((x) => x.status === 'IN_REVIEW').length;
    const myTodo = myOpen.filter((x) => x.status === 'TODO').length;

    return [
      `Öneri: Önce ${myCritical} kritik görevi ele al.`,
      `Öneri: Beklemede ${myTodo} görev var, birini hemen başlat.`,
      `Öneri: İncelemede ${myReview} görev var, geri bildirimleri kapat.`,
      `İvme: Bugün ${myTodaySubmissionCount} teslim gönderdin.`,
    ];
  }, [currentUser, isCaptain, tickets, todayStart, myTodaySubmissionCount]);

  const introScore = useMemo(() => {
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    if (!currentUser) {
      return { score: 50, label: 'Orta', tone: 'mid' as 'high' | 'mid' | 'low' };
    }

    if (isCaptain) {
      const openTickets = tickets.filter((x) => x.status !== 'DONE');
      const criticalOpen = openTickets.filter((x) => x.priority === 'CRITICAL').length;
      const unassignedOpen = openTickets.filter((x) => x.assignees.length === 0).length;
      const reviewCount = openTickets.filter((x) => x.status === 'IN_REVIEW').length;
      const doneToday = tickets.filter(
        (x) =>
          x.status === 'DONE' &&
          x.completedAt &&
          new Date(x.completedAt).getTime() >= todayStart.getTime(),
      ).length;

      const score = clamp(
        82 - openTickets.length * 1.3 - criticalOpen * 3.2 - unassignedOpen * 2.4 - reviewCount * 1.1 + doneToday * 2.5,
      );
      if (score >= 75) return { score, label: 'Yüksek', tone: 'high' as const };
      if (score >= 50) return { score, label: 'Orta', tone: 'mid' as const };
      return { score, label: 'Düşük', tone: 'low' as const };
    }

    const myOpen = tickets.filter(
      (x) =>
        x.status !== 'DONE' &&
        x.assignees.some((a) => a.member.id === currentUser.id),
    );
    const myCritical = myOpen.filter((x) => x.priority === 'CRITICAL').length;
    const myReview = myOpen.filter((x) => x.status === 'IN_REVIEW').length;
    const myTodo = myOpen.filter((x) => x.status === 'TODO').length;

    const score = clamp(
      84 - myOpen.length * 2.1 - myCritical * 3.8 - myTodo * 1.7 - myReview * 1.2 + myTodaySubmissionCount * 2.2,
    );
    if (score >= 75) return { score, label: 'Yüksek', tone: 'high' as const };
    if (score >= 50) return { score, label: 'Orta', tone: 'mid' as const };
    return { score, label: 'Düşük', tone: 'low' as const };
  }, [currentUser, isCaptain, tickets, todayStart, myTodaySubmissionCount]);

  const todayText = useMemo(
    () =>
      new Date().toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  const introTerminalLines = useMemo(() => {
    const lines = [`> Tarih: ${todayText}`];
    if (loading) {
      lines.push('> Gunluk durum hazirlaniyor...');
    }

    if (isCaptain) {
      lines.push(`> Takimda toplam ${teamMembers.length} aktif uye var.`);
      lines.push(`> Bugun yonetilecek ${captainOpenTaskCount} aktif gorev var.`);
    } else {
      lines.push(`> Bugun ${myActiveTaskCount} aktif gorevin var.`);
      lines.push(`> Bugun ${myTodaySubmissionCount} teslim gonderdin.`);
    }

    lines.push('> AI Asistan: Odaklan, ilerle, tamamla.');
    lines.push(...introInsights.slice(0, 3).map((line) => `> ${line}`));
    return lines;
  }, [
    todayText,
    loading,
    isCaptain,
    teamMembers.length,
    captainOpenTaskCount,
    myActiveTaskCount,
    myTodaySubmissionCount,
    introInsights,
  ]);

  const introLineRanges = useMemo(() => {
    let cursor = 0;
    return introTerminalLines.map((line) => {
      const start = cursor;
      cursor += line.length;
      return { start, end: cursor };
    });
  }, [introTerminalLines]);

  const introTotalChars = introLineRanges.length
    ? introLineRanges[introLineRanges.length - 1].end
    : 0;

  const getTypedIntroLine = (lineIndex: number) => {
    const range = introLineRanges[lineIndex];
    if (!range) return '';
    const visibleChars = Math.max(0, Math.min(range.end - range.start, introTypedChars - range.start));
    return introTerminalLines[lineIndex].slice(0, visibleChars);
  };

  const filteredSubmissions = allSubmissions.filter(({ submission, ticket }) => {
    const byName = submission.fileName
      .toLowerCase()
      .includes(submissionSearch.toLowerCase());
    const byUser =
      submissionByFilter === 'ALL' || submission.submittedBy.id === submissionByFilter;
    const byProject =
      submissionProjectFilter === 'ALL' || ticket.projectId === submissionProjectFilter;
    const createdAtMs = new Date(submission.createdAt).getTime();
    const byStart =
      !submissionStartDate ||
      createdAtMs >= new Date(`${submissionStartDate}T00:00:00`).getTime();
    const byEnd =
      !submissionEndDate ||
      createdAtMs <= new Date(`${submissionEndDate}T23:59:59.999`).getTime();
    return byName && byUser && byProject && byStart && byEnd;
  });

  const submissionWeeklyStats = useMemo(() => {
    const bucket = new Map<string, number>();
    filteredSubmissions.forEach(({ submission }) => {
      const d = new Date(submission.createdAt);
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const weekKey = `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      bucket.set(weekKey, (bucket.get(weekKey) ?? 0) + 1);
    });
    return Array.from(bucket.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8);
  }, [filteredSubmissions]);

  function getFileTypeLabel(fileName: string) {
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    if (ext === 'pdf') return 'PDF';
    if (ext === 'doc' || ext === 'docx') return 'WORD';
    if (ext === 'ppt' || ext === 'pptx') return 'PPT';
    return 'FILE';
  }

  function showToast(type: 'success' | 'error', message: string) {
    const item = {
      id: toastIdRef.current++,
      type,
      message,
    };
    setToastQueue((prev) => [
      ...prev,
      item,
    ]);
    setNotificationHistory((prev) => [
      { ...item, createdAt: new Date().toISOString() },
      ...prev,
    ].slice(0, 50));
  }

  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = setTimeout(() => {
      setToastQueue((prev) => prev.slice(1));
    }, 2400);
    return () => clearTimeout(timer);
  }, [toastQueue]);
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

  function assertRoleAccess(path: string, method: string) {
    if (isCaptain) return;
    const upperMethod = method.toUpperCase();
    if (upperMethod === 'GET') return;

    if (path.startsWith('/team-members')) {
      throw new Error('Bu islem icin kaptan yetkisi gerekir.');
    }
    if (path === '/tickets' && upperMethod === 'POST') {
      throw new Error('Gorev olusturma sadece kaptan icindir.');
    }
    if (/^\/tickets\/[^/]+\/assignee$/.test(path) && upperMethod === 'PATCH') {
      throw new Error('Atama islemi sadece kaptan icindir.');
    }
    if (path === '/tickets/bulk/status' && upperMethod === 'PATCH') {
      throw new Error('Toplu guncelleme sadece kaptan icindir.');
    }
    if (/^\/tickets\/[^/]+$/.test(path) && upperMethod === 'DELETE') {
      throw new Error('Gorev silme sadece kaptan icindir.');
    }
    if (path.startsWith('/projects') && upperMethod !== 'GET') {
      throw new Error('Proje yonetimi sadece kaptan icindir.');
    }
  }

  async function refreshAuthToken() {
    try {
      setRefreshingToken(true);
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      const next = (await res.json()) as AuthBundle;
      localStorage.setItem('jira_auth', JSON.stringify(next));
      setAuthBundle(next);
      return next;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }
      throw error;
    } finally {
      setRefreshingToken(false);
    }
  }

  async function apiFetch(path: string, init?: RequestInit, retried = false) {
    if (!authBundle) throw new Error('Login required');
    const method = init?.method ?? 'GET';
    assertRoleAccess(path, method);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${authBundle.accessToken}`,
      ...(init?.headers ? (init.headers as Record<string, string>) : {}),
    };
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, { ...init, headers });
    } catch (error) {
      throw new Error(error instanceof TypeError ? NETWORK_ERROR_MESSAGE : String(error));
    }
    if (res.status === 401 && !retried) {
      const next = await refreshAuthToken();
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
      const message = await extractErrorMessage(res);
      showToast('error', message);
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function loadAll() {
    if (!currentUser) return;
    const [projectData, memberData, ticketData] = await Promise.all([
      apiFetch('/projects'),
      apiFetch('/team-members?activeOnly=true'),
      apiFetch('/tickets'),
    ]);
    setProjects(projectData);
    setTeamMembers(memberData);
    setTickets(ticketData);
  }

  useEffect(() => {
    const cached = localStorage.getItem('jira_auth');
    const prefs = localStorage.getItem('jira_ui_prefs');
    if (prefs) {
      try {
        const parsed = JSON.parse(prefs) as {
          captainTab?: CaptainTab;
          memberTab?: MemberTab;
          taskLayout?: 'board' | 'list';
          teamRoleFilter?: 'ALL' | TeamRole;
          taskStatusFilter?: 'ALL' | TicketStatus;
          taskPriorityFilter?: 'ALL' | TicketPriority;
        };
        if (parsed.captainTab) setCaptainTab(parsed.captainTab);
        if (parsed.memberTab) setMemberTab(parsed.memberTab);
        if (parsed.taskLayout) setTaskLayout(parsed.taskLayout);
        if (parsed.teamRoleFilter) setTeamRoleFilter(parsed.teamRoleFilter);
        if (parsed.taskStatusFilter) setTaskStatusFilter(parsed.taskStatusFilter);
        if (parsed.taskPriorityFilter) setTaskPriorityFilter(parsed.taskPriorityFilter);
      } catch {}
    }
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
    if (!currentUser) return;
    if (currentUser.role === 'CAPTAIN') {
      setMemberTab('my_tasks');
      return;
    }
    setCaptainTab('overview');
  }, [currentUser]);

  useEffect(() => {
    const validIds = new Set(tickets.map((t) => t.id));
    setSelectedTicketIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [tickets]);

  useEffect(() => {
    if (!authBundle) return;
    const timer = setInterval(async () => {
      if (refreshingToken) return;
      const expMs = new Date(authBundle.accessTokenExpiresAt).getTime();
      const now = Date.now();
      if (expMs - now <= 60_000) {
        try {
          await refreshAuthToken();
        } catch {
          await logout();
        }
      }
    }, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBundle, refreshingToken]);

  useEffect(() => {
    localStorage.setItem(
      'jira_ui_prefs',
      JSON.stringify({
        captainTab,
        memberTab,
        taskLayout,
        teamRoleFilter,
        taskStatusFilter,
        taskPriorityFilter,
      }),
    );
  }, [
    captainTab,
    memberTab,
    taskLayout,
    teamRoleFilter,
    taskStatusFilter,
    taskPriorityFilter,
  ]);

  useEffect(() => {
    if (introStage !== 'terminal') return;
    setIntroTypedChars(0);
  }, [introStage]);

  useEffect(() => {
    if (introStage !== 'terminal') return;
    if (introTotalChars === 0) return;
    const tickMs = Math.max(8, Math.floor(1000 / TYPEWRITER_CHARS_PER_SECOND));
    const timer = setInterval(() => {
      setIntroTypedChars((prev) => {
        if (prev >= introTotalChars) return prev;
        return prev + 1;
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [introStage, introTotalChars]);

  useEffect(() => {
    if (introStage !== 'quote') return;
    const timer = setInterval(() => {
      setIntroQuote((prev) => pickNextQuote(prev));
    }, QUOTE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [introStage]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    if (isLoggingIn) return;
    setError('');
    setLoginFieldError('');
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      setLoginFieldError('E-posta ve sifre zorunludur');
      return;
    }
    try {
      setIsLoggingIn(true);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      const bundle = (await res.json()) as AuthBundle;
      localStorage.setItem('jira_auth', JSON.stringify(bundle));
      setLoading(true);
      setAuthBundle(bundle);
      setIntroStage('terminal');
      setIntroQuote((prev) => pickNextQuote(prev));
      setLoginEmail('');
      setLoginPassword('');
      showToast('success', 'Giriş başarılı');
    } catch (e) {
      const message =
        e instanceof TypeError ? NETWORK_ERROR_MESSAGE : (e as Error).message;
      setError(message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function onForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (isSendingResetLink) return;
    setForgotFieldError('');
    setError('');
    const email = forgotEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setForgotFieldError('Gecerli bir e-posta giriniz');
      return;
    }
    try {
      setIsSendingResetLink(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FORGOT_PASSWORD_TIMEOUT_MS);
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      setForgotEmail('');
      setIsForgotMode(false);
      showToast('success', 'Sifre sifirlama baglantisi gonderildi');
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Sifre sifirlama istegi zaman asimina ugradi. SMTP ayarlarini kontrol edin.'
          : e instanceof TypeError
            ? NETWORK_ERROR_MESSAGE
            : (e as Error).message;
      setError(message);
    } finally {
      setIsSendingResetLink(false);
    }
  }

  async function logout() {
    try {
      if (authBundle) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
      }
    } catch {}
    localStorage.removeItem('jira_auth');
    setAuthBundle(null);
    setProjects([]);
    setTickets([]);
    setTeamMembers([]);
    setCaptainTab('overview');
    setMemberTab('my_tasks');
    setIntroStage('none');
    showToast('success', 'Oturum kapatıldı');
  }

  async function createMember(e: FormEvent) {
    e.preventDefault();
    if (!isCaptain) return;
    if (isCreatingMember) return;
    setError('');
    setMemberFieldError('');
    const name = memberName.trim();
    const email = memberEmail.trim().toLowerCase();
    const password = memberPassword;
    if (name.length < 2) {
      setMemberFieldError('Uye adi en az 2 karakter olmali');
      return;
    }
    if (!email.includes('@')) {
      setMemberFieldError('Gecerli bir e-posta giriniz');
      return;
    }
    if (password.length < 4) {
      setMemberFieldError('Sifre en az 4 karakter olmali');
      return;
    }
    try {
      setIsCreatingMember(true);
      await apiFetch('/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role: memberRole,
        }),
      });
      setMemberName('');
      setMemberEmail('');
      setMemberPassword('');
      setMemberRole('MEMBER');
      await loadAll();
      showToast('success', 'Üye eklendi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreatingMember(false);
    }
  }

  async function deactivateMember(id: string) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/team-members/${id}`, { method: 'DELETE' });
      await loadAll();
      showToast('success', 'Üye pasifleştirildi');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    if (!isCaptain) return;
    if (isCreatingTicket) return;
    setError('');
    setTicketFieldError('');
    const title = ticketTitle.trim();
    if (title.length < 3) {
      setTicketFieldError('Gorev basligi en az 3 karakter olmali');
      return;
    }
    try {
      setIsCreatingTicket(true);
      await apiFetch('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: ticketDesc || undefined,
          priority: ticketPriority,
          assigneeIds: ticketAssignees,
        }),
      });
      setTicketTitle('');
      setTicketDesc('');
      setTicketPriority('MEDIUM');
      setTicketAssignees([]);
      await loadAll();
      showToast('success', 'Görev oluşturuldu');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreatingTicket(false);
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
      await loadAll();
      showToast('success', 'Atananlar güncellendi');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteTicket(ticket: Ticket) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/tickets/${ticket.id}`, { method: 'DELETE' });
      await loadAll();
      showToast('success', 'Görev silindi');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((prev) =>
      prev.includes(ticketId)
        ? prev.filter((id) => id !== ticketId)
        : [...prev, ticketId],
    );
  }

  function toggleSelectAllVisible() {
    if (visibleTicketIds.length === 0) return;
    setSelectedTicketIds((prev) => {
      if (areAllVisibleSelected) {
        return prev.filter((id) => !visibleTicketIds.includes(id));
      }
      const next = new Set(prev);
      visibleTicketIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  async function bulkUpdateTicketStatus() {
    if (!isCaptain || selectedTicketIds.length === 0 || isBulkUpdating) return;
    setError('');
    const selectedCount = selectedTicketIds.length;
    try {
      setIsBulkUpdating(true);
      const result = (await apiFetch('/tickets/bulk/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketIds: selectedTicketIds,
          status: bulkStatus,
        }),
      })) as {
        updatedCount: number;
        failedIds?: string[];
        partial?: boolean;
      };
      setSelectedTicketIds([]);
      await loadAll();
      if (result.partial && (result.failedIds?.length ?? 0) > 0) {
        showToast(
          'error',
          `${result.updatedCount}/${selectedCount} guncellendi. Basarisiz ID: ${result.failedIds!.join(', ')}`,
        );
      } else {
        showToast('success', `${result.updatedCount} gorev toplu guncellendi`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsBulkUpdating(false);
    }
  }

  async function moveStatus(
    ticket: Ticket,
    status: TicketStatus,
    origin: 'manual' | 'drag' = 'manual',
  ) {
    if (ticket.status === status) return;
    setError('');
    const previousTickets = tickets;
    setTickets((prev) =>
      prev.map((item) =>
        item.id === ticket.id ? { ...item, status } : item,
      ),
    );
    try {
      await apiFetch(`/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (origin === 'drag') {
        setDropPulseTicketId(ticket.id);
        setTimeout(() => setDropPulseTicketId(null), 420);
      }
      showToast('success', 'Durum güncellendi');
    } catch (e) {
      setTickets(previousTickets);
      setError((e as Error).message);
    }
  }

  function onBoardDragStart(ticketId: string) {
    setDragTicketId(ticketId);
    setIsBoardDragging(true);
  }

  function onBoardDragEnd() {
    setDragTicketId(null);
    setDragOverStatus(null);
    setIsBoardDragging(false);
  }

  function onColumnDragOver(e: DragEvent<HTMLElement>, status: TicketStatus) {
    e.preventDefault();
    if (dragOverStatus !== status) setDragOverStatus(status);
  }

  function onColumnDrop(e: DragEvent<HTMLElement>, status: TicketStatus) {
    e.preventDefault();
    if (!dragTicketId) return;
    const ticket = tickets.find((x) => x.id === dragTicketId);
    setDragTicketId(null);
    setDragOverStatus(null);
    setIsBoardDragging(false);
    if (!ticket) return;
    void moveStatus(ticket, status, 'drag');
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

  function setUploadFieldError(ticketId: string, message: string) {
    setUploadFieldErrors((prev) => ({ ...prev, [ticketId]: message }));
  }

  function clearUploadFieldError(ticketId: string) {
    setUploadFieldErrors((prev) => {
      if (!prev[ticketId]) return prev;
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
  }

  async function submitFile(ticket: Ticket) {
    if (uploadingTicketId === ticket.id) return;
    const draft = uploadDrafts[ticket.id];
    clearUploadFieldError(ticket.id);
    if (!draft?.file || !currentUser) {
      setUploadFieldError(ticket.id, 'Dosya secmeden teslim gonderemezsin');
      return;
    }
    if (draft.file.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadFieldError(ticket.id, 'Maksimum dosya boyutu 25 MB olabilir');
      return;
    }
    const ext = draft.file.name.toLowerCase().split('.').pop() ?? '';
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      setUploadFieldError(ticket.id, 'Sadece PDF, DOC, DOCX, PPT, PPTX kabul edilir');
      return;
    }
    setError('');
    try {
      setUploadingTicketId(ticket.id);
      const form = new FormData();
      form.set('submittedById', currentUser.id);
      form.set('note', draft.note);
      form.set('file', draft.file);
      await apiFetch(`/tickets/${ticket.id}/submissions`, {
        method: 'POST',
        body: form,
      });
      setUpload(ticket.id, { note: '', file: null });
      clearUploadFieldError(ticket.id);
      await loadAll();
      showToast('success', 'Teslim gönderildi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingTicketId((prev) => (prev === ticket.id ? null : prev));
    }
  }

  function exportSubmissionsCsv() {
    const rows = filteredSubmissions.map(({ submission, ticket }) => {
      const projectKey = projects.find((p) => p.id === ticket.projectId)?.key ?? '-';
      return {
        createdAt: new Date(submission.createdAt).toISOString(),
        project: projectKey,
        ticket: ticket.title,
        fileName: submission.fileName,
        submittedBy: submission.submittedBy.name,
        role: ROLE_LABELS[submission.submittedBy.role],
        note: submission.note ?? '',
      };
    });
    if (rows.length === 0) {
      showToast('error', 'Dışa aktarma için teslim kaydı bulunamadı');
      return;
    }
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      'created_at',
      'project',
      'ticket',
      'file_name',
      'submitted_by',
      'role',
      'note',
    ];
    const body = rows.map((r) =>
      [
        r.createdAt,
        r.project,
        r.ticket,
        r.fileName,
        r.submittedBy,
        r.role,
        r.note,
      ]
        .map((cell) => escapeCsv(String(cell)))
        .join(','),
    );
    const csv = [header.join(','), ...body].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('success', 'CSV dışa aktarma hazırlandı');
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
      showToast('success', 'Dosya indiriliyor');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!currentUser) {
    return (
      <main className="app">
        <section className="panel loginPanel">
          <h1>Ülgen AR-GE Giriş</h1>
          <p className="muted">Üyeler e-posta ve şifre ile giriş yapar.</p>
          <p className="muted">
            İlk kurulum kaptan: captain@ulgen.local / 1234
          </p>
          {error && <p className="errorBox">{error}</p>}
          <form onSubmit={onLogin} className="formBlock">
            <input
              placeholder="E-posta"
              value={loginEmail}
              onChange={(e) => {
                setLoginEmail(e.target.value);
                setLoginFieldError('');
              }}
              required
            />
            <input
              type="password"
              placeholder="Sifre"
              value={loginPassword}
              onChange={(e) => {
                setLoginPassword(e.target.value);
                setLoginFieldError('');
              }}
              required
            />
            {loginFieldError && <p className="fieldError">{loginFieldError}</p>}
            <button type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'Giris yapiliyor...' : 'Giris Yap'}
            </button>
          </form>
          <button
            type="button"
            className="textBtn"
            onClick={() => {
              setIsForgotMode((prev) => !prev);
              setForgotFieldError('');
            }}
          >
            {isForgotMode ? 'Giris formuna don' : 'Sifremi unuttum'}
          </button>
          {isForgotMode && (
            <form onSubmit={onForgotPassword} className="formBlock forgotForm">
              <input
                placeholder="Kayitli e-posta"
                value={forgotEmail}
                onChange={(e) => {
                  setForgotEmail(e.target.value);
                  setForgotFieldError('');
                }}
                required
              />
              {forgotFieldError && <p className="fieldError">{forgotFieldError}</p>}
              <button type="submit" disabled={isSendingResetLink}>
                {isSendingResetLink
                  ? 'Baglanti gonderiliyor...'
                  : 'Sifre sifirlama baglantisi gonder'}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  if (introStage !== 'none') {
    return (
      <main className="introShell">
        <AnimatePresence mode="wait">
          {introStage === 'terminal' && (
            <motion.section
              key="intro-terminal"
              className="introTerminal"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <p className="introTag">ULGEN://DAILY-BRIEF</p>
              <h1>Hoş geldin, {currentUser.name}.</h1>
              <div className="introScore">
                <p className="introScoreValue">{`Günlük Odak Puanı: ${introScore.score}/100`}</p>
                <span
                  className={
                    introScore.tone === 'high'
                      ? 'scoreBadge scoreHigh'
                      : introScore.tone === 'mid'
                        ? 'scoreBadge scoreMid'
                        : 'scoreBadge scoreLow'
                  }
                >
                  {`Durum: ${introScore.label}`}
                </span>
              </div>
              <div className="terminalBox">
                {introTerminalLines.map((line, index) => {
                  const typedLine = getTypedIntroLine(index);
                  if (!typedLine) return null;
                  const range = introLineRanges[index];
                  const isTyping =
                    introTypedChars < introTotalChars &&
                    introTypedChars > range.start &&
                    introTypedChars <= range.end;
                  return (
                    <p
                      key={`${line}-${index}`}
                      className={isTyping ? 'terminalLine isTyping' : 'terminalLine'}
                    >
                      {typedLine}
                    </p>
                  );
                })}
              </div>
              <button
                type="button"
                className="introActionBtn"
                onClick={() => {
                  setIntroQuote((prev) => pickNextQuote(prev));
                  setIntroStage('quote');
                }}
              >
                Girişe Devam Et
              </button>
            </motion.section>
          )}

          {introStage === 'quote' && (
            <motion.section
              key="intro-quote"
              className="introQuote"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p className="quoteMark">“</p>
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={introQuote}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  {introQuote}
                </motion.blockquote>
              </AnimatePresence>
              <button
                type="button"
                className="introActionBtn introLightBtn"
                onClick={() => setIntroStage('none')}
              >
                Çalışma Alanına Geç
              </button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Ülgen AR-GE Çalışma Alanı</p>
          <h1>Rol Bazlı Görev Yönetimi</h1>
          <p className="muted">
            {currentUser.name} ({ROLE_LABELS[currentUser.role]}) ile aktif oturum.
          </p>
        </div>
        <div className="stats">
          <article className="statCard">
            <span>Sistem</span>
            <strong>{projects.length}</strong>
          </article>
          <article className="statCard">
            <span>Görev</span>
            <strong>{tickets.length}</strong>
          </article>
          <article className="statCard">
            <span>Teslim</span>
            <strong>{allSubmissions.length}</strong>
          </article>
        </div>
      </section>

      {error && <p className="errorBox">{error}</p>}
      {toastQueue[0] && (
        <p
          className={
            toastQueue[0].type === 'success' ? 'toast toastSuccess' : 'toast toastError'
          }
        >
          {toastQueue[0].message}
        </p>
      )}
      <div className="notificationBar">
        <button
          type="button"
          className="notifToggle"
          onClick={() => setIsNotificationOpen((prev) => !prev)}
        >
          Bildirim Merkezi ({notificationHistory.length})
        </button>
        {notificationHistory.length > 0 && (
          <button
            type="button"
            className="notifClear"
            onClick={() => setNotificationHistory([])}
          >
            Temizle
          </button>
        )}
      </div>
      {isNotificationOpen && (
        <section className="notificationPanel panel">
          <div className="notifHead">
            <h3>Bildirim GeÃ§miÅŸi</h3>
            <select
              value={notificationFilter}
              onChange={(e) =>
                setNotificationFilter(e.target.value as 'ALL' | 'success' | 'error')
              }
            >
              <option value="ALL">Tumu</option>
              <option value="success">Basarili</option>
              <option value="error">Hata</option>
            </select>
          </div>
          {filteredNotificationHistory.length === 0 && (
            <p className="muted">HenÃ¼z bildirim yok.</p>
          )}
          <ul className="notificationList">
            {filteredNotificationHistory.map((item) => (
              <li key={item.id}>
                <span className={item.type === 'success' ? 'notifOk' : 'notifErr'}>
                  {item.type === 'success' ? 'OK' : 'ERR'}
                </span>
                <div>
                  <strong>{item.message}</strong>
                  <p>{new Date(item.createdAt).toLocaleString('tr-TR')}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="workspace">
        <aside className="sidebar panel">
          <div className="panelHead">
            <h2>{isCaptain ? 'Kaptan Paneli' : 'Üye Paneli'}</h2>
            <button type="button" onClick={logout}>
              Çıkış
            </button>
          </div>

          {isCaptain ? (
            <LayoutGroup id="captain-tabs">
              <div className="tabStack">
                <button type="button" className={captainTab === 'overview' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('overview')}><span>Genel</span>{captainTab === 'overview' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'team' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('team')}><span>Takım</span>{captainTab === 'team' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('tasks')}><span>Görevler</span>{captainTab === 'tasks' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('submissions')}><span>Teslimler</span>{captainTab === 'submissions' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
              </div>
            </LayoutGroup>
          ) : (
            <LayoutGroup id="member-tabs">
              <div className="tabStack">
                <button type="button" className={memberTab === 'my_tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_tasks')}><span>Bana Atananlar</span>{memberTab === 'my_tasks' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'my_submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_submissions')}><span>Teslimlerim</span>{memberTab === 'my_submissions' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'timeline' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('timeline')}><span>Akış</span>{memberTab === 'timeline' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
              </div>
            </LayoutGroup>
          )}

          <p className="muted">
            Sistem Projesi: {systemProject ? `${systemProject.key} - ${systemProject.name}` : 'Hazırlanıyor'}
          </p>
        </aside>

        <section className="board panel">
          {loading && (
            <div className="skeletonWrap">
              <div className="skeletonLine" />
              <div className="skeletonGrid">
                <div className="skeletonCard" />
                <div className="skeletonCard" />
                <div className="skeletonCard" />
              </div>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
          {!loading && isCaptain && captainTab === 'overview' && (
            <motion.div
              key="captain-overview"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
            <div className="cardGrid">
              <article className="infoCard">
                <h3>Takım Dağılımı</h3>
                <p>
                  Kaptan {teamMembers.filter((x) => x.role === 'CAPTAIN').length} | Kurul{' '}
                  {teamMembers.filter((x) => x.role === 'BOARD').length} | Üye{' '}
                  {teamMembers.filter((x) => x.role === 'MEMBER').length}
                </p>
              </article>
              <article className="infoCard">
                <h3>Durum Özeti</h3>
                <p>
                  Beklemede {tickets.filter((x) => x.status === 'TODO').length} | Devam Ediyor{' '}
                  {tickets.filter((x) => x.status === 'IN_PROGRESS').length} | Tamamlandı{' '}
                  {tickets.filter((x) => x.status === 'DONE').length}
                </p>
              </article>
            </div>
            <div className="filterRow">
              <input
                type="date"
                value={captainMetricsStart}
                onChange={(e) => setCaptainMetricsStart(e.target.value)}
                aria-label="Metrik baslangic tarihi"
              />
              <input
                type="date"
                value={captainMetricsEnd}
                onChange={(e) => setCaptainMetricsEnd(e.target.value)}
                aria-label="Metrik bitis tarihi"
              />
            </div>
            <div className="weekChart">
              <h3>Gorev Tamamlama Trendi</h3>
              {captainTrendLast7.map((item) => (
                <div key={item.key} className="weekRow">
                  <span>{item.label}</span>
                  <div className="weekBar">
                    <i style={{ width: `${Math.max(8, item.doneCount * 18)}px` }} />
                  </div>
                  <strong>{item.doneCount}</strong>
                </div>
              ))}
            </div>
            <div className="infoCard">
              <h3>Kritik Acik Gorevler</h3>
              {captainCriticalTickets.length === 0 && (
                <p className="muted">Acil gorev bulunmuyor.</p>
              )}
              {captainCriticalTickets.map((ticket) => (
                <p key={ticket.id} className="muted">
                  {ticket.title} ({STATUS_LABELS[ticket.status]})
                </p>
              ))}
            </div>
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'team' && (
            <motion.div
              key="captain-team"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
            <div className="teamBlock">
              <div className="filterRow">
                <input
                  placeholder="Üye ara (ad/e-posta)"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                />
                <select
                  value={teamRoleFilter}
                  onChange={(e) =>
                    setTeamRoleFilter(e.target.value as 'ALL' | TeamRole)
                  }
                >
                  <option value="ALL">Tüm Roller</option>
                  <option value="CAPTAIN">Kaptan</option>
                  <option value="BOARD">Kurul</option>
                  <option value="MEMBER">Üye</option>
                </select>
              </div>
              <form onSubmit={createMember} className="formBlock">
                <input
                  placeholder="Ad Soyad"
                  value={memberName}
                  onChange={(e) => {
                    setMemberName(e.target.value);
                    setMemberFieldError('');
                  }}
                  required
                />
                <input
                  placeholder="E-posta"
                  value={memberEmail}
                  onChange={(e) => {
                    setMemberEmail(e.target.value);
                    setMemberFieldError('');
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Sifre"
                  value={memberPassword}
                  onChange={(e) => {
                    setMemberPassword(e.target.value);
                    setMemberFieldError('');
                  }}
                  required
                />
                <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as TeamRole)}>
                  {(['MEMBER', 'BOARD', 'CAPTAIN'] as TeamRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {memberFieldError && <p className="fieldError">{memberFieldError}</p>}
                <button type="submit" disabled={isCreatingMember}>
                  {isCreatingMember ? 'Ekleniyor...' : 'Uye Ekle'}
                </button>
              </form>
              <ul className="memberList">
                {filteredTeamMembers.map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <div className="muted">{m.email}</div>
                    </div>
                    <button type="button" onClick={() => deactivateMember(m.id)}>
                      Pasifleştir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'tasks' && (
            <motion.div
              key="captain-tasks"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Görev ara"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
                <select
                  value={taskStatusFilter}
                  onChange={(e) =>
                    setTaskStatusFilter(e.target.value as 'ALL' | TicketStatus)
                  }
                >
                  <option value="ALL">Tüm Durumlar</option>
                  {STATUS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <select
                  value={taskPriorityFilter}
                  onChange={(e) =>
                    setTaskPriorityFilter(e.target.value as 'ALL' | TicketPriority)
                  }
                >
                  <option value="ALL">Tüm Öncelikler</option>
                  <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                  <option value="MEDIUM">{PRIORITY_LABELS.MEDIUM}</option>
                  <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                  <option value="CRITICAL">{PRIORITY_LABELS.CRITICAL}</option>
                </select>
                <select
                  value={taskAssigneeFilter}
                  onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                >
                  <option value="ALL">Tüm Atananlar</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="panelHead">
                <h2>Görevler</h2>
                <button type="button" className={taskLayout === 'board' ? 'tabBtn active' : 'tabBtn'} onClick={() => setTaskLayout(taskLayout === 'board' ? 'list' : 'board')}>
                  {taskLayout === 'board' ? 'Listeye Geç' : 'Panoya Geç'}
                </button>
              </div>
              <div className="bulkActionBar">
                <span>{selectedTicketIds.length} secili</span>
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  disabled={visibleTicketIds.length === 0}
                >
                  {areAllVisibleSelected ? 'Gorunen Secimi Kaldir' : 'Gorunenleri Sec'}
                </button>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as TicketStatus)}
                >
                  {STATUS_LIST.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={bulkUpdateTicketStatus}
                  disabled={selectedTicketIds.length === 0 || isBulkUpdating}
                >
                  {isBulkUpdating ? 'Guncelleniyor...' : 'Toplu Durum Guncelle'}
                </button>
                {selectedTicketIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTicketIds([])}
                  >
                    Secimi Temizle
                  </button>
                )}
              </div>

              <form onSubmit={createTicket} className="ticketForm">
                <input
                  placeholder="Gorev basligi"
                  value={ticketTitle}
                  onChange={(e) => {
                    setTicketTitle(e.target.value);
                    setTicketFieldError('');
                  }}
                  required
                />
                <textarea placeholder="Aciklama" value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} />
                <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}>
                  <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                  <option value="MEDIUM">{PRIORITY_LABELS.MEDIUM}</option>
                  <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                  <option value="CRITICAL">{PRIORITY_LABELS.CRITICAL}</option>
                </select>
                <select multiple value={ticketAssignees} onChange={(e) => setTicketAssignees(Array.from(e.currentTarget.selectedOptions).map((o) => o.value))}>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {ticketFieldError && <p className="fieldError">{ticketFieldError}</p>}
                <button type="submit" disabled={isCreatingTicket}>
                  {isCreatingTicket ? 'Olusturuluyor...' : 'Gorev Olustur'}
                </button>
              </form>

              {taskLayout === 'board' ? (
                <div className={isBoardDragging ? 'columns draggingMode' : 'columns'}>
                  {STATUS_LIST.map((status) => (
                    <section
                      key={status}
                      className={dragOverStatus === status ? 'column columnDrop' : 'column'}
                      onDragOver={(e) => onColumnDragOver(e, status)}
                      onDragLeave={() =>
                        setDragOverStatus((prev) => (prev === status ? null : prev))
                      }
                      onDrop={(e) => onColumnDrop(e, status)}
                    >
                      <header>
                        <h3>{STATUS_LABELS[status]}</h3>
                        <span>{grouped[status].length}</span>
                      </header>
                      <div className="ticketStack">
                        {grouped[status].map((ticket) => (
                          <article
                            key={ticket.id}
                            className={[
                              'ticketCard',
                              dragTicketId === ticket.id ? 'dragging' : '',
                              dropPulseTicketId === ticket.id ? 'dropPulse' : '',
                            ]
                              .join(' ')
                              .trim()}
                          >
                            <button
                              type="button"
                              className="dragHandle"
                              draggable
                              onDragStart={() => onBoardDragStart(ticket.id)}
                              onDragEnd={onBoardDragEnd}
                              title="Durum değiştirmek için sürükle"
                            >
                              <span>⋮⋮</span>
                            </button>
                            <label className="selectTicketRow">
                              <input
                                type="checkbox"
                                checked={selectedTicketIds.includes(ticket.id)}
                                onChange={() => toggleTicketSelection(ticket.id)}
                              />
                              <span>Sec</span>
                            </label>
                            <strong>{ticket.title}</strong>
                            <p>{ticket.description || '-'}</p>
                            <div className="ticketMeta">
                              <span>{PRIORITY_LABELS[ticket.priority]}</span>
                              <select value={ticket.status} onChange={(e) => moveStatus(ticket, e.target.value as TicketStatus)}>
                                {STATUS_LIST.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="quickRow">
                              <button type="button" onClick={() => moveStatus(ticket, 'IN_PROGRESS')}>
                                Başla
                              </button>
                              <button type="button" onClick={() => moveStatus(ticket, 'IN_REVIEW')}>
                                İncele
                              </button>
                              <button type="button" onClick={() => moveStatus(ticket, 'DONE')}>
                                Tamamla
                              </button>
                            </div>
                            <p className="muted">
                              Atananlar: {ticket.assignees.map((x) => x.member.name).join(', ') || 'Yok'}
                            </p>
                            <div className="projectActions">
                              <select multiple value={ticket.assignees.map((x) => x.member.id)} onChange={(e) => updateTicketAssignees(ticket, Array.from(e.currentTarget.selectedOptions).map((o) => o.value))}>
                                {teamMembers.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                              <button type="button" onClick={() => deleteTicket(ticket)}>
                                Görevi Sil
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <table className="taskTable">
                  <thead>
                    <tr>
                      <th>Sec</th>
                      <th>Başlık</th>
                      <th>Durum</th>
                      <th>Öncelik</th>
                      <th>Atananlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSelectedProjectTickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTicketIds.includes(ticket.id)}
                            onChange={() => toggleTicketSelection(ticket.id)}
                          />
                        </td>
                        <td>{ticket.title}</td>
                        <td>{STATUS_LABELS[ticket.status]}</td>
                        <td>{PRIORITY_LABELS[ticket.priority]}</td>
                        <td>{ticket.assignees.map((a) => a.member.name).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'submissions' && (
            <motion.div
              key="captain-submissions"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Dosya ara"
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                />
                <select
                  value={submissionByFilter}
                  onChange={(e) => setSubmissionByFilter(e.target.value)}
                >
                  <option value="ALL">Tüm Üyeler</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={submissionProjectFilter}
                  onChange={(e) => setSubmissionProjectFilter(e.target.value)}
                >
                  <option value="ALL">Tüm Projeler</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.key}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={submissionStartDate}
                  onChange={(e) => setSubmissionStartDate(e.target.value)}
                  aria-label="Başlangıç tarihi"
                />
                <input
                  type="date"
                  value={submissionEndDate}
                  onChange={(e) => setSubmissionEndDate(e.target.value)}
                  aria-label="Bitis tarihi"
                />
                <button type="button" onClick={exportSubmissionsCsv}>
                  CSV Dışa Aktar
                </button>
              </div>
              <ul className="submissionRows">
                {filteredSubmissions.map(({ submission, ticket }) => (
                <li key={submission.id}>
                  <div>
                    <strong>{submission.fileName}</strong>
                    <span className={`fileBadge type-${getFileTypeLabel(submission.fileName).toLowerCase()}`}>
                      {getFileTypeLabel(submission.fileName)}
                    </span>
                    <p>
                      {(projects.find((p) => p.id === ticket.projectId)?.key ?? 'ULGEN-SYSTEM')} / {ticket.title}
                    </p>
                  </div>
                  <button type="button" onClick={() => downloadSubmission(submission)}>
                    İndir
                  </button>
                </li>
                ))}
              </ul>
              <div className="weekChart">
                <h3>Haftalık Teslim Sayısı</h3>
                {submissionWeeklyStats.length === 0 && (
                  <p className="muted">Grafik için teslim verisi yok.</p>
                )}
                {submissionWeeklyStats.map((item) => (
                  <div key={item.week} className="weekRow">
                    <span>{item.week}</span>
                    <div className="weekBar">
                      <i style={{ width: `${Math.max(8, item.count * 20)}px` }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {!loading && !isCaptain && memberTab === 'my_tasks' && (
            <motion.div
              key="member-tasks"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Görev ara"
                  value={memberTaskSearch}
                  onChange={(e) => setMemberTaskSearch(e.target.value)}
                />
              </div>
              <div className="ticketStack">
              {myTickets.map((ticket) => (
                <article key={ticket.id} className="ticketCard">
                  <strong>{ticket.title}</strong>
                  <p>{ticket.description || '-'}</p>
                  <div className="ticketMeta">
                    <span>{PRIORITY_LABELS[ticket.priority]}</span>
                    <select value={ticket.status} onChange={(e) => moveStatus(ticket, e.target.value as TicketStatus)}>
                      {STATUS_LIST.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="quickRow">
                    <button type="button" onClick={() => moveStatus(ticket, 'IN_PROGRESS')}>
                      Başla
                    </button>
                    <button type="button" onClick={() => moveStatus(ticket, 'IN_REVIEW')}>
                      İncele
                    </button>
                    <button type="button" onClick={() => moveStatus(ticket, 'DONE')}>
                      Tamamla
                    </button>
                  </div>
                  <div className="submissionBox">
                    <h4>Teslim Dosyası</h4>
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
                      disabled={uploadingTicketId === ticket.id}
                    />
                    <input placeholder="Not" value={uploadDrafts[ticket.id]?.note ?? ''} onChange={(e) => setUpload(ticket.id, { note: e.target.value })} />
                    <button
                      type="button"
                      onClick={() => submitFile(ticket)}
                      disabled={uploadingTicketId === ticket.id}
                    >
                      {uploadingTicketId === ticket.id
                        ? 'Gonderiliyor...'
                        : 'Teslim Gonder'}
                    </button>
                    {uploadFieldErrors[ticket.id] && (
                      <p className="fieldError">{uploadFieldErrors[ticket.id]}</p>
                    )}
                  </div>
                </article>
              ))}
              </div>
            </motion.div>
          )}

          {!loading && !isCaptain && memberTab === 'my_submissions' && (
            <motion.div
              key="member-submissions"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Teslim dosyası ara"
                  value={memberSubmissionSearch}
                  onChange={(e) => setMemberSubmissionSearch(e.target.value)}
                />
              </div>
              <ul className="submissionRows">
              {mySubmissions.map(({ submission, ticket }) => (
                <li key={submission.id}>
                  <div>
                    <strong>{submission.fileName}</strong>
                    <span className={`fileBadge type-${getFileTypeLabel(submission.fileName).toLowerCase()}`}>
                      {getFileTypeLabel(submission.fileName)}
                    </span>
                    <p>{ticket.title}</p>
                  </div>
                  <button type="button" onClick={() => downloadSubmission(submission)}>
                    İndir
                  </button>
                </li>
              ))}
              </ul>
            </motion.div>
          )}

          {!loading && !isCaptain && memberTab === 'timeline' && (
            <motion.ul
              key="member-timeline"
              className="timeline tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {myTickets.map((ticket) => (
                <li key={ticket.id}>
                  <strong>{ticket.title}</strong>
                  <p>{STATUS_LABELS[ticket.status]}</p>
                </li>
              ))}
            </motion.ul>
          )}
          </AnimatePresence>
        </section>
      </section>
    </main>
  );
}














