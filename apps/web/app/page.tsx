'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import Link from 'next/link';

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

type TicketReview = {
  id: string;
  action: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  createdAt: string;
  reviewer: Pick<TeamMember, 'id' | 'name' | 'role'>;
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
  reviewNote?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: Pick<TeamMember, 'id' | 'name' | 'role'> | null;
  assignees: Array<{ member: TeamMember }>;
  submissions: Submission[];
  reviews: TicketReview[];
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

type CaptainTab = 'overview' | 'team' | 'tasks' | 'submissions' | 'settings';
type MemberTab = 'my_tasks' | 'my_submissions' | 'timeline' | 'archive' | 'settings';
type ToastItem = { id: number; type: 'success' | 'error'; message: string };
type NotificationItem = ToastItem & { createdAt: string };
type IntroStage = 'none' | 'terminal' | 'quote';
type ReviewAction = 'APPROVE' | 'REJECT';
type ArchiveResponse = {
  items: Ticket[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type UserSettings = {
  language: 'tr' | 'en';
  notificationEmailEnabled: boolean;
  notificationAssignmentEnabled: boolean;
  notificationReviewEnabled: boolean;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  language: 'tr' | 'en';
  notificationEmailEnabled: boolean;
  notificationAssignmentEnabled: boolean;
  notificationReviewEnabled: boolean;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
};

type LoginHistoryItem = {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TYPEWRITER_CHARS_PER_SECOND = 120;
const QUOTE_ROTATE_MS = 5000;
const NETWORK_ERROR_MESSAGE = 'Sunucuya ulasilamadi. Lutfen baglantiyi ve API adresini kontrol edin.';
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx']);
const STATUS_LIST: TicketStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const BOARD_STATUS_LIST = ['IN_PROGRESS'] as const;

const toLocalDateKey = (dateInput: string | Date) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  TODO: 'Beklemede',
  IN_PROGRESS: 'Devam Ediyor',
  IN_REVIEW: 'Ä°ncelemede',
  DONE: 'TamamlandÄ±',
};

const ROLE_LABELS: Record<TeamRole, string> = {
  MEMBER: 'Ãœye',
  BOARD: 'YÃ¶netim Kurulu',
  CAPTAIN: 'Kaptan',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'DÃ¼ÅŸÃ¼k',
  MEDIUM: 'Orta',
  HIGH: 'YÃ¼ksek',
  CRITICAL: 'Kritik',
};

const SUCCESS_QUOTES = [
  'Disiplinli ilerleme, gÃ¼nlÃ¼k motivasyondan daha gÃ¼Ã§lÃ¼dÃ¼r.',
  'KÃ¼Ã§Ã¼k ama sÃ¼rekli adÄ±mlar, bÃ¼yÃ¼k sonuÃ§lar Ã¼retir.',
  'MÃ¼kemmeli bekleme, bugÃ¼n baÅŸla ve geliÅŸtir.',
  'OdaklandÄ±ÄŸÄ±n iÅŸ, gelecekteki standardÄ±nÄ± belirler.',
  'BaÅŸarÄ± tesadÃ¼f deÄŸil, tekrarlanan doÄŸru davranÄ±ÅŸtÄ±r.',
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
  const [captainMemberFocusId, setCaptainMemberFocusId] = useState<'ALL' | string>('ALL');
  const [captainArchiveSearch, setCaptainArchiveSearch] = useState('');
  const [captainArchiveStartDate, setCaptainArchiveStartDate] = useState('');
  const [captainArchiveEndDate, setCaptainArchiveEndDate] = useState('');
  const [memberArchiveSearch, setMemberArchiveSearch] = useState('');
  const [memberArchiveStartDate, setMemberArchiveStartDate] = useState('');
  const [memberArchiveEndDate, setMemberArchiveEndDate] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [captainArchivePage, setCaptainArchivePage] = useState(1);
  const [memberArchivePage, setMemberArchivePage] = useState(1);
  const [captainArchiveData, setCaptainArchiveData] = useState<ArchiveResponse | null>(null);
  const [memberArchiveData, setMemberArchiveData] = useState<ArchiveResponse | null>(null);
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
  const [settingsFieldError, setSettingsFieldError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileFieldError, setProfileFieldError] = useState('');
  const [settingsData, setSettingsData] = useState<UserSettings>({
    language: 'tr',
    notificationEmailEnabled: true,
    notificationAssignmentEnabled: true,
    notificationReviewEnabled: true,
  });
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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

  const grouped = useMemo(
    () => ({
      IN_PROGRESS: filteredSelectedProjectTickets.filter(
        (t) => t.status === 'IN_PROGRESS' || t.status === 'TODO',
      ),
    }),
    [filteredSelectedProjectTickets],
  );

  const myTickets = useMemo(() => {
    if (!currentUser) return [] as Ticket[];
    return tickets
      .filter((ticket) =>
        ticket.assignees.some((x) => x.member.id === currentUser.id),
      )
      .filter((ticket) => ticket.status !== 'DONE' && ticket.status !== 'IN_REVIEW')
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

  const captainScopedTickets = useMemo(() => {
    if (captainMemberFocusId === 'ALL') return tickets;
    return tickets.filter((ticket) =>
      ticket.assignees.some((x) => x.member.id === captainMemberFocusId),
    );
  }, [tickets, captainMemberFocusId]);

  const captainPendingReviewTickets = useMemo(
    () => captainScopedTickets.filter((ticket) => ticket.status === 'IN_REVIEW'),
    [captainScopedTickets],
  );

  const captainArchiveTickets = captainArchiveData?.items ?? [];
  const myArchiveTickets = memberArchiveData?.items ?? [];

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
      const key = toLocalDateKey(day);
      const doneCount = tickets.filter((t) => {
        if (t.status !== 'DONE' || !t.completedAt) return false;
        return toLocalDateKey(t.completedAt) === key;
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
        `Ã–neri: ${criticalOpen} kritik gÃ¶rev iÃ§in gÃ¼n baÅŸÄ±nda kÄ±sa plan yap.`,
        `Ã–neri: ${unassignedOpen} atanmamÄ±ÅŸ aÃ§Ä±k gÃ¶rev var, sahiplik belirle.`,
        `Ã–neri: Ä°ncelemede ${reviewCount} gÃ¶rev var, akÅŸamdan Ã¶nce netleÅŸtir.`,
        `Ä°vme: BugÃ¼n ${doneToday} gÃ¶rev tamamlandÄ±.`,
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
      `Ã–neri: Ã–nce ${myCritical} kritik gÃ¶revi ele al.`,
      `Ã–neri: Beklemede ${myTodo} gÃ¶rev var, birini hemen baÅŸlat.`,
      `Ã–neri: Ä°ncelemede ${myReview} gÃ¶rev var, geri bildirimleri kapat.`,
      `Ä°vme: BugÃ¼n ${myTodaySubmissionCount} teslim gÃ¶nderdin.`,
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
      if (score >= 75) return { score, label: 'YÃ¼ksek', tone: 'high' as const };
      if (score >= 50) return { score, label: 'Orta', tone: 'mid' as const };
      return { score, label: 'DÃ¼ÅŸÃ¼k', tone: 'low' as const };
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
    if (score >= 75) return { score, label: 'YÃ¼ksek', tone: 'high' as const };
    if (score >= 50) return { score, label: 'Orta', tone: 'mid' as const };
    return { score, label: 'DÃ¼ÅŸÃ¼k', tone: 'low' as const };
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
    if (/^\/tickets\/[^/]+\/review$/.test(path) && upperMethod === 'PATCH') {
      throw new Error('Inceleme islemi sadece kaptan icindir.');
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

  async function loadCaptainArchive() {
    if (!isCaptain) return;
    const query = new URLSearchParams();
    if (captainMemberFocusId !== 'ALL') query.set('memberId', captainMemberFocusId);
    if (captainArchiveSearch.trim()) query.set('q', captainArchiveSearch.trim());
    if (captainArchiveStartDate) query.set('from', captainArchiveStartDate);
    if (captainArchiveEndDate) query.set('to', captainArchiveEndDate);
    query.set('page', String(captainArchivePage));
    query.set('pageSize', '20');
    const data = (await apiFetch(`/tickets/archive?${query.toString()}`)) as ArchiveResponse;
    setCaptainArchiveData(data);
  }

  async function loadMemberArchive() {
    if (!currentUser || isCaptain) return;
    const query = new URLSearchParams();
    if (memberArchiveSearch.trim()) query.set('q', memberArchiveSearch.trim());
    if (memberArchiveStartDate) query.set('from', memberArchiveStartDate);
    if (memberArchiveEndDate) query.set('to', memberArchiveEndDate);
    query.set('page', String(memberArchivePage));
    query.set('pageSize', '20');
    const data = (await apiFetch(`/tickets/archive?${query.toString()}`)) as ArchiveResponse;
    setMemberArchiveData(data);
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
    setSettingsLoaded(false);
  }, [authBundle?.user?.id]);

  useEffect(() => {
    setCaptainArchivePage(1);
  }, [captainMemberFocusId, captainArchiveSearch, captainArchiveStartDate, captainArchiveEndDate]);

  useEffect(() => {
    setMemberArchivePage(1);
  }, [memberArchiveSearch, memberArchiveStartDate, memberArchiveEndDate]);

  useEffect(() => {
    if (!authBundle || loading) return;
    if (!isCaptain || captainTab !== 'submissions') return;
    void loadCaptainArchive().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authBundle,
    loading,
    isCaptain,
    captainTab,
    captainMemberFocusId,
    captainArchiveSearch,
    captainArchiveStartDate,
    captainArchiveEndDate,
    captainArchivePage,
  ]);

  useEffect(() => {
    if (!authBundle || loading) return;
    if (isCaptain || memberTab !== 'archive') return;
    void loadMemberArchive().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authBundle,
    loading,
    isCaptain,
    memberTab,
    memberArchiveSearch,
    memberArchiveStartDate,
    memberArchiveEndDate,
    memberArchivePage,
  ]);

  useEffect(() => {
    if (!authBundle || loading) return;
    const open =
      (isCaptain && captainTab === 'settings') || (!isCaptain && memberTab === 'settings');
    if (!open) return;
    if (settingsLoaded) return;
    void loadSettingsData().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBundle, loading, isCaptain, captainTab, memberTab, settingsLoaded]);

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
      showToast('success', 'GiriÅŸ baÅŸarÄ±lÄ±');
    } catch (e) {
      const message =
        e instanceof TypeError ? NETWORK_ERROR_MESSAGE : (e as Error).message;
      setError(message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (isChangingPassword) return;
    setSettingsFieldError('');
    setError('');

    const currentPassword = settingsCurrentPassword;
    const newPassword = settingsNewPassword;
    const confirmPassword = settingsConfirmPassword;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setSettingsFieldError('Tum alanlar zorunludur');
      return;
    }
    if (newPassword.length < 6) {
      setSettingsFieldError('Yeni sifre en az 6 karakter olmali');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSettingsFieldError('Yeni sifre ve tekrar alani eslesmiyor');
      return;
    }
    try {
      setIsChangingPassword(true);
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSettingsCurrentPassword('');
      setSettingsNewPassword('');
      setSettingsConfirmPassword('');
      showToast('success', 'Sifre guncellendi. Guvenlik icin tekrar giris yapmaniz onerilir.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function loadSettingsData() {
    const profile = (await apiFetch('/auth/profile')) as UserProfile;
    const history = (await apiFetch('/auth/login-history')) as LoginHistoryItem[];
    setProfileName(profile.name);
    setSettingsData({
      language: profile.language,
      notificationEmailEnabled: profile.notificationEmailEnabled,
      notificationAssignmentEnabled: profile.notificationAssignmentEnabled,
      notificationReviewEnabled: profile.notificationReviewEnabled,
    });
    setLoginHistory(history);
    setSettingsLoaded(true);
  }

  async function onUpdateProfile(e: FormEvent) {
    e.preventDefault();
    if (isUpdatingProfile) return;
    setProfileFieldError('');
    setError('');
    const name = profileName.trim();
    if (name.length < 2) {
      setProfileFieldError('Ad en az 2 karakter olmali');
      return;
    }
    try {
      setIsUpdatingProfile(true);
      const user = (await apiFetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })) as TeamMember;
      setAuthBundle((prev) =>
        prev
          ? {
              ...prev,
              user: { ...prev.user, name: user.name },
            }
          : prev,
      );
      showToast('success', 'Profil bilgileri guncellendi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  async function onUpdateSettings(e: FormEvent) {
    e.preventDefault();
    if (isUpdatingSettings) return;
    setError('');
    try {
      setIsUpdatingSettings(true);
      const updated = (await apiFetch('/auth/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData),
      })) as UserSettings;
      setSettingsData(updated);
      showToast('success', 'Ayarlar guncellendi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsUpdatingSettings(false);
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
    setCaptainArchiveData(null);
    setMemberArchiveData(null);
    setSettingsLoaded(false);
    setLoginHistory([]);
    setCaptainTab('overview');
    setMemberTab('my_tasks');
    setIntroStage('none');
    showToast('success', 'Oturum kapatÄ±ldÄ±');
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
      showToast('success', 'Ãœye eklendi');
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
      showToast('success', 'Ãœye pasifleÅŸtirildi');
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
      showToast('success', 'GÃ¶rev oluÅŸturuldu');
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
      showToast('success', 'Atananlar gÃ¼ncellendi');
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
      showToast('success', 'GÃ¶rev silindi');
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
      showToast('success', 'Durum gÃ¼ncellendi');
    } catch (e) {
      setTickets(previousTickets);
      setError((e as Error).message);
    }
  }

  function setReviewReason(ticketId: string, reason: string) {
    setReviewReasons((prev) => ({ ...prev, [ticketId]: reason }));
  }

  async function reviewTicket(ticket: Ticket, action: ReviewAction) {
    if (!isCaptain) return;
    const reason = (reviewReasons[ticket.id] ?? '').trim();
    if (action === 'REJECT' && reason.length < 3) {
      setError('Gorev ret icin en az 3 karakter aciklama girin');
      return;
    }
    setError('');
    try {
      await apiFetch(`/tickets/${ticket.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: reason || undefined,
        }),
      });
      setReviewReasons((prev) => {
        if (!prev[ticket.id]) return prev;
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
      await loadAll();
      showToast('success', action === 'APPROVE' ? 'Gorev onaylandi ve arsive tasindi' : 'Gorev revizeye gonderildi');
    } catch (e) {
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
      showToast('success', 'Teslim gÃ¶nderildi');
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
      showToast('error', 'DÄ±ÅŸa aktarma iÃ§in teslim kaydÄ± bulunamadÄ±');
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
    showToast('success', 'CSV dÄ±ÅŸa aktarma hazÄ±rlandÄ±');
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
          <h1>Ãœlgen AR-GE GiriÅŸ</h1>
          <p className="muted">Ãœyeler e-posta ve ÅŸifre ile giriÅŸ yapar.</p>
          <p className="muted">
            Ä°lk kurulum kaptan: captain@ulgen.local / 1234
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
          <Link href="/forgot-password" className="textBtn inlineLink">
            Sifremi unuttum
          </Link>
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
              <h1>HoÅŸ geldin, {currentUser.name}.</h1>
              <div className="introScore">
                <p className="introScoreValue">{`GÃ¼nlÃ¼k Odak PuanÄ±: ${introScore.score}/100`}</p>
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
                GiriÅŸe Devam Et
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
              <p className="quoteMark">â€œ</p>
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
                Ã‡alÄ±ÅŸma AlanÄ±na GeÃ§
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
          <p className="eyebrow">Ãœlgen AR-GE Ã‡alÄ±ÅŸma AlanÄ±</p>
          <h1>Rol BazlÄ± GÃ¶rev YÃ¶netimi</h1>
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
            <span>GÃ¶rev</span>
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
            <h3>Bildirim GeÃƒÂ§miÃ…Å¸i</h3>
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
            <p className="muted">HenÃƒÂ¼z bildirim yok.</p>
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
            <h2>{isCaptain ? 'Kaptan Paneli' : 'Ãœye Paneli'}</h2>
            <button type="button" onClick={logout}>
              Ã‡Ä±kÄ±ÅŸ
            </button>
          </div>

          {isCaptain ? (
            <LayoutGroup id="captain-tabs">
              <div className="tabStack">
                <button type="button" className={captainTab === 'overview' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('overview')}><span>Genel</span>{captainTab === 'overview' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'team' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('team')}><span>TakÄ±m</span>{captainTab === 'team' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('tasks')}><span>GÃ¶revler</span>{captainTab === 'tasks' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('submissions')}><span>Üye Sekmesi</span>{captainTab === 'submissions' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'settings' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('settings')}><span>Ayarlar</span>{captainTab === 'settings' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
              </div>
            </LayoutGroup>
          ) : (
            <LayoutGroup id="member-tabs">
              <div className="tabStack">
                <button type="button" className={memberTab === 'my_tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_tasks')}><span>Bana Atananlar</span>{memberTab === 'my_tasks' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'my_submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_submissions')}><span>Teslimlerim</span>{memberTab === 'my_submissions' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'timeline' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('timeline')}><span>AkÄ±ÅŸ</span>{memberTab === 'timeline' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'archive' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('archive')}><span>Arsiv</span>{memberTab === 'archive' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'settings' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('settings')}><span>Ayarlar</span>{memberTab === 'settings' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
              </div>
            </LayoutGroup>
          )}

          <p className="muted">
            Sistem Projesi: {systemProject ? `${systemProject.key} - ${systemProject.name}` : 'HazÄ±rlanÄ±yor'}
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
                <h3>TakÄ±m DaÄŸÄ±lÄ±mÄ±</h3>
                <p>
                  Kaptan {teamMembers.filter((x) => x.role === 'CAPTAIN').length} | Kurul{' '}
                  {teamMembers.filter((x) => x.role === 'BOARD').length} | Ãœye{' '}
                  {teamMembers.filter((x) => x.role === 'MEMBER').length}
                </p>
              </article>
              <article className="infoCard">
                <h3>Durum Ã–zeti</h3>
                <p>
                  Beklemede {tickets.filter((x) => x.status === 'TODO').length} | Devam Ediyor{' '}
                  {tickets.filter((x) => x.status === 'IN_PROGRESS').length} | TamamlandÄ±{' '}
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
                  placeholder="Ãœye ara (ad/e-posta)"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                />
                <select
                  value={teamRoleFilter}
                  onChange={(e) =>
                    setTeamRoleFilter(e.target.value as 'ALL' | TeamRole)
                  }
                >
                  <option value="ALL">TÃ¼m Roller</option>
                  <option value="CAPTAIN">Kaptan</option>
                  <option value="BOARD">Kurul</option>
                  <option value="MEMBER">Ãœye</option>
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
                      PasifleÅŸtir
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
                  placeholder="GÃ¶rev ara"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
                <select
                  value={taskStatusFilter}
                  onChange={(e) =>
                    setTaskStatusFilter(e.target.value as 'ALL' | TicketStatus)
                  }
                >
                  <option value="ALL">TÃ¼m Durumlar</option>
                  {BOARD_STATUS_LIST.map((s) => (
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
                  <option value="ALL">TÃ¼m Ã–ncelikler</option>
                  <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                  <option value="MEDIUM">{PRIORITY_LABELS.MEDIUM}</option>
                  <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                  <option value="CRITICAL">{PRIORITY_LABELS.CRITICAL}</option>
                </select>
                <select
                  value={taskAssigneeFilter}
                  onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                >
                  <option value="ALL">TÃ¼m Atananlar</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="panelHead">
                <h2>GÃ¶revler</h2>
                <button type="button" className={taskLayout === 'board' ? 'tabBtn active' : 'tabBtn'} onClick={() => setTaskLayout(taskLayout === 'board' ? 'list' : 'board')}>
                  {taskLayout === 'board' ? 'Listeye GeÃ§' : 'Panoya GeÃ§'}
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
                  {BOARD_STATUS_LIST.map((s) => (
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
                  {BOARD_STATUS_LIST.map((status) => (
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
                              title="Durum deÄŸiÅŸtirmek iÃ§in sÃ¼rÃ¼kle"
                            >
                              <span>â‹®â‹®</span>
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
                    <span>{ticket.status === 'TODO' ? STATUS_LABELS.IN_PROGRESS : STATUS_LABELS[ticket.status]}</span>
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
                                GÃ¶revi Sil
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
                      <th>BaÅŸlÄ±k</th>
                      <th>Durum</th>
                      <th>Ã–ncelik</th>
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
                <select
                  value={captainMemberFocusId}
                  onChange={(e) => setCaptainMemberFocusId(e.target.value)}
                >
                  <option value="ALL">Tum Uyeler</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Arsivde gorev ara"
                  value={captainArchiveSearch}
                  onChange={(e) => setCaptainArchiveSearch(e.target.value)}
                />
                <input
                  type="date"
                  value={captainArchiveStartDate}
                  onChange={(e) => setCaptainArchiveStartDate(e.target.value)}
                  aria-label="Arsiv baslangic tarihi"
                />
                <input
                  type="date"
                  value={captainArchiveEndDate}
                  onChange={(e) => setCaptainArchiveEndDate(e.target.value)}
                  aria-label="Arsiv bitis tarihi"
                />
              </div>

              <section className="panel" style={{ padding: '12px', marginBottom: '12px' }}>
                <h3>Inceleme Bekleyen Gorevler</h3>
                <ul className="submissionRows">
                  {captainPendingReviewTickets.map((ticket) => {
                    const latest = ticket.submissions[0];
                    return (
                      <li key={ticket.id}>
                        <div>
                          <strong>{ticket.title}</strong>
                          <p>
                            {ticket.assignees.map((x) => x.member.name).join(', ') || 'Atanan yok'} | Son teslim:{' '}
                            {latest ? new Date(latest.createdAt).toLocaleString('tr-TR') : 'Yok'}
                          </p>
                          {latest && (
                            <button type="button" onClick={() => downloadSubmission(latest)}>
                              Son Teslimi Indir
                            </button>
                          )}
                          <input
                            placeholder="Ret gerekcesi"
                            value={reviewReasons[ticket.id] ?? ''}
                            onChange={(e) => setReviewReason(ticket.id, e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          <button type="button" onClick={() => reviewTicket(ticket, 'APPROVE')}>
                            Onay Ver
                          </button>
                          <button type="button" onClick={() => reviewTicket(ticket, 'REJECT')}>
                            Gorev Ret
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {captainPendingReviewTickets.length === 0 && (
                    <li>
                      <p className="muted">Bu filtrede inceleme bekleyen gorev yok.</p>
                    </li>
                  )}
                </ul>
              </section>

              <section className="panel" style={{ padding: '12px' }}>
                <h3>Arsiv (Onaylanan Gorevler)</h3>
                <ul className="submissionRows">
                  {captainArchiveTickets.map((ticket) => (
                    <li key={ticket.id}>
                      <div>
                        <strong>{ticket.title}</strong>
                        <p>{ticket.description || '-'}</p>
                        {ticket.reviewNote && <p>Son revize notu: {ticket.reviewNote}</p>}
                        <p>
                          {ticket.assignees.map((x) => x.member.name).join(', ') || 'Atanan yok'} |{' '}
                          {ticket.completedAt ? new Date(ticket.completedAt).toLocaleString('tr-TR') : '-'}
                        </p>
                        {ticket.reviews.length > 0 && (
                          <p>
                            Son onay: {ticket.reviews[0].reviewer.name} /{' '}
                            {new Date(ticket.reviews[0].createdAt).toLocaleString('tr-TR')}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                  {captainArchiveTickets.length === 0 && (
                    <li>
                      <p className="muted">Arsivde gorev bulunamadi.</p>
                    </li>
                  )}
                </ul>
                <div className="quickRow">
                  <button
                    type="button"
                    disabled={(captainArchiveData?.page ?? 1) <= 1}
                    onClick={() => setCaptainArchivePage((prev) => Math.max(1, prev - 1))}
                  >
                    Onceki
                  </button>
                  <p className="muted">
                    Sayfa {captainArchiveData?.page ?? 1} / {captainArchiveData?.totalPages ?? 1}
                  </p>
                  <button
                    type="button"
                    disabled={(captainArchiveData?.page ?? 1) >= (captainArchiveData?.totalPages ?? 1)}
                    onClick={() => setCaptainArchivePage((prev) => prev + 1)}
                  >
                    Sonraki
                  </button>
                </div>
              </section>
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
                  placeholder="GÃ¶rev ara"
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
                    <span>{ticket.status === 'TODO' ? STATUS_LABELS.IN_PROGRESS : STATUS_LABELS[ticket.status]}</span>
                  </div>
                  <div className="submissionBox">
                    <h4>Teslim DosyasÄ±</h4>
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
                  placeholder="Teslim dosyasÄ± ara"
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
                    Ä°ndir
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
          {!loading && !isCaptain && memberTab === 'archive' && (
            <motion.div
              key="member-archive"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Arsiv gorevi ara"
                  value={memberArchiveSearch}
                  onChange={(e) => setMemberArchiveSearch(e.target.value)}
                />
                <input
                  type="date"
                  value={memberArchiveStartDate}
                  onChange={(e) => setMemberArchiveStartDate(e.target.value)}
                  aria-label="Arsiv baslangic tarihi"
                />
                <input
                  type="date"
                  value={memberArchiveEndDate}
                  onChange={(e) => setMemberArchiveEndDate(e.target.value)}
                  aria-label="Arsiv bitis tarihi"
                />
              </div>
              <ul className="submissionRows">
                {myArchiveTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <div>
                      <strong>{ticket.title}</strong>
                      <p>{ticket.description || '-'}</p>
                      {ticket.reviewNote && <p>Revize notu: {ticket.reviewNote}</p>}
                      <p>
                        {ticket.completedAt
                          ? new Date(ticket.completedAt).toLocaleString('tr-TR')
                          : '-'}
                      </p>
                      {ticket.reviews.length > 0 && (
                        <p>
                          Son karar: {ticket.reviews[0].action} /{' '}
                          {new Date(ticket.reviews[0].createdAt).toLocaleString('tr-TR')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
                {myArchiveTickets.length === 0 && (
                  <li>
                    <p className="muted">Arsivde gorev bulunamadi.</p>
                  </li>
                )}
              </ul>
              <div className="quickRow">
                <button
                  type="button"
                  disabled={(memberArchiveData?.page ?? 1) <= 1}
                  onClick={() => setMemberArchivePage((prev) => Math.max(1, prev - 1))}
                >
                  Onceki
                </button>
                <p className="muted">
                  Sayfa {memberArchiveData?.page ?? 1} / {memberArchiveData?.totalPages ?? 1}
                </p>
                <button
                  type="button"
                  disabled={(memberArchiveData?.page ?? 1) >= (memberArchiveData?.totalPages ?? 1)}
                  onClick={() => setMemberArchivePage((prev) => prev + 1)}
                >
                  Sonraki
                </button>
              </div>
            </motion.div>
          )}
          {!loading && ((isCaptain && captainTab === 'settings') || (!isCaptain && memberTab === 'settings')) && (
            <motion.div
              key="settings-tab"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <section className="panel" style={{ padding: '12px' }}>
                <h3>Ayarlar</h3>
                <p className="muted">Profil bilgileri, bildirim tercihleri, dil ve sifre islemleri.</p>
                <form onSubmit={onUpdateProfile} className="formBlock" style={{ marginBottom: '12px' }}>
                  <h4>Profil Bilgileri</h4>
                  <input
                    placeholder="Ad Soyad"
                    value={profileName}
                    onChange={(e) => {
                      setProfileName(e.target.value);
                      setProfileFieldError('');
                    }}
                    required
                  />
                  <input value={currentUser.email} disabled />
                  <input value={ROLE_LABELS[currentUser.role]} disabled />
                  {profileFieldError && <p className="fieldError">{profileFieldError}</p>}
                  <button type="submit" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? 'Kaydediliyor...' : 'Profili Kaydet'}
                  </button>
                </form>

                <form onSubmit={onUpdateSettings} className="formBlock" style={{ marginBottom: '12px' }}>
                  <h4>Bildirimler ve Dil</h4>
                  <label>
                    <input
                      type="checkbox"
                      checked={settingsData.notificationEmailEnabled}
                      onChange={(e) =>
                        setSettingsData((prev) => ({
                          ...prev,
                          notificationEmailEnabled: e.target.checked,
                        }))
                      }
                    />
                    E-posta bildirimleri acik
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settingsData.notificationAssignmentEnabled}
                      onChange={(e) =>
                        setSettingsData((prev) => ({
                          ...prev,
                          notificationAssignmentEnabled: e.target.checked,
                        }))
                      }
                    />
                    Gorev atama bildirimi acik
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settingsData.notificationReviewEnabled}
                      onChange={(e) =>
                        setSettingsData((prev) => ({
                          ...prev,
                          notificationReviewEnabled: e.target.checked,
                        }))
                      }
                    />
                    Inceleme/ret bildirimi acik
                  </label>
                  <select
                    value={settingsData.language}
                    onChange={(e) =>
                      setSettingsData((prev) => ({
                        ...prev,
                        language: e.target.value as 'tr' | 'en',
                      }))
                    }
                  >
                    <option value="tr">Turkce</option>
                    <option value="en">English</option>
                  </select>
                  <button type="submit" disabled={isUpdatingSettings}>
                    {isUpdatingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </button>
                </form>

                <form onSubmit={onChangePassword} className="formBlock">
                  <h4>Sifre Degistir</h4>
                  <input
                    type="password"
                    placeholder="Mevcut sifre"
                    value={settingsCurrentPassword}
                    onChange={(e) => {
                      setSettingsCurrentPassword(e.target.value);
                      setSettingsFieldError('');
                    }}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Yeni sifre"
                    value={settingsNewPassword}
                    onChange={(e) => {
                      setSettingsNewPassword(e.target.value);
                      setSettingsFieldError('');
                    }}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Yeni sifre (tekrar)"
                    value={settingsConfirmPassword}
                    onChange={(e) => {
                      setSettingsConfirmPassword(e.target.value);
                      setSettingsFieldError('');
                    }}
                    required
                  />
                  {settingsFieldError && <p className="fieldError">{settingsFieldError}</p>}
                  <button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? 'Guncelleniyor...' : 'Sifreyi Degistir'}
                  </button>
                </form>

                <div className="formBlock" style={{ marginTop: '12px' }}>
                  <h4>Son Giris Gecmisi</h4>
                  <ul className="submissionRows">
                    {loginHistory.map((entry) => (
                      <li key={entry.id}>
                        <div>
                          <strong>{new Date(entry.createdAt).toLocaleString('tr-TR')}</strong>
                          <p>IP: {entry.ip || '-'}</p>
                          <p>{entry.userAgent || '-'}</p>
                        </div>
                      </li>
                    ))}
                    {loginHistory.length === 0 && (
                      <li>
                        <p className="muted">Giris gecmisi kaydi bulunamadi.</p>
                      </li>
                    )}
                  </ul>
                </div>
              </section>
            </motion.div>
          )}
          </AnimatePresence>
        </section>
      </section>
    </main>
  );
}















