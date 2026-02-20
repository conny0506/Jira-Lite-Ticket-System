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
  lateReason?: string | null;
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
  dueAt?: string | null;
  completedAt?: string | null;
  reviewNote?: string | null;
  assignees: Array<{ member: TeamMember; seenAt?: string | null }>;
  submissions: Submission[];
};

type UploadDraft = {
  note: string;
  lateReason: string;
  file: File | null;
};

type CaptainFileDraft = {
  note: string;
  submittedForMemberId: string;
  file: File | null;
};

type AuthBundle = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: TeamMember;
};

type MeetingInfo = {
  id: string;
  scheduledAt: string;
  meetingUrl: string;
  note?: string | null;
  reminderSentAt?: string | null;
  createdBy: Pick<TeamMember, 'id' | 'name' | 'email'>;
};

type CaptainTab =
  | 'home'
  | 'meeting'
  | 'overview'
  | 'team'
  | 'tasks'
  | 'submissions';
type MemberTab = 'home' | 'my_tasks' | 'my_submissions' | 'timeline';
type ToastItem = { id: number; type: 'success' | 'error'; message: string };
type NotificationItem = ToastItem & { createdAt: string };
type IntroStage = 'none' | 'terminal' | 'quote';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TYPEWRITER_CHARS_PER_SECOND = 120;
const QUOTE_ROTATE_MS = 5000;
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

type TicketCreateDraft = {
  title: string;
  description: string;
  priority: TicketPriority;
  dueAt: string;
  primaryAssigneeId: string;
  secondaryAssigneeId: string;
  attachmentFile: File | null;
  attachmentNote: string;
};

function normalizeAssigneeIds(assigneeIds: string[]) {
  return [...new Set(assigneeIds.filter(Boolean))];
}

function validateOptionalUploadFile(file: File | null) {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return 'Dosya boyutu 25MB sinirini asamaz';
  }
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return 'Yalnizca pdf/doc/docx/ppt/pptx yuklenebilir';
  }
  return null;
}

function validateTicketCreateDraft(draft: TicketCreateDraft) {
  if (draft.title.length < 3) {
    return 'Gorev basligi en az 3 karakter olmali';
  }
  if (!draft.primaryAssigneeId) {
    return 'En az 1 atanan secmelisin';
  }
  if (
    draft.secondaryAssigneeId &&
    draft.secondaryAssigneeId === draft.primaryAssigneeId
  ) {
    return 'Ikinci atanan, birinci atanan ile ayni olamaz';
  }
  return validateOptionalUploadFile(draft.attachmentFile);
}

function buildCreateTicketFormData(draft: TicketCreateDraft) {
  const form = new FormData();
  form.set('title', draft.title);
  form.set('description', draft.description);
  form.set('priority', draft.priority);
  form.set('dueAt', new Date(draft.dueAt).toISOString());
  form.append('assigneeIds', draft.primaryAssigneeId);
  if (draft.secondaryAssigneeId) {
    form.append('assigneeIds', draft.secondaryAssigneeId);
  }
  if (draft.attachmentNote.trim()) {
    form.set('attachmentNote', draft.attachmentNote.trim());
  }
  if (draft.attachmentFile) {
    form.set('file', draft.attachmentFile);
  }
  return form;
}

function pickNextQuote(previousQuote: string) {
  if (SUCCESS_QUOTES.length < 2) return SUCCESS_QUOTES[0] ?? previousQuote;
  let next = previousQuote;
  while (next === previousQuote) {
    next = SUCCESS_QUOTES[Math.floor(Math.random() * SUCCESS_QUOTES.length)];
  }
  return next;
}

function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60 * 1000);
  return local.toISOString().slice(0, 16);
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
  const [uploadingCaptainFileTicketId, setUploadingCaptainFileTicketId] =
    useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('MEMBER');

  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('MEDIUM');
  const [ticketDueAt, setTicketDueAt] = useState('');
  const [ticketPrimaryAssigneeId, setTicketPrimaryAssigneeId] = useState('');
  const [ticketSecondaryAssigneeId, setTicketSecondaryAssigneeId] = useState('');
  const [ticketAttachmentFile, setTicketAttachmentFile] = useState<File | null>(null);
  const [ticketAttachmentNote, setTicketAttachmentNote] = useState('');

  const [uploadDrafts, setUploadDrafts] = useState<Record<string, UploadDraft>>({});
  const [captainFileDrafts, setCaptainFileDrafts] =
    useState<Record<string, CaptainFileDraft>>({});
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [captainTab, setCaptainTab] = useState<CaptainTab>('home');
  const [memberTab, setMemberTab] = useState<MemberTab>('home');
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [meetingScheduledAt, setMeetingScheduledAt] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingNote, setMeetingNote] = useState('');
  const [meetingFieldError, setMeetingFieldError] = useState('');
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
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
  const [submissionProjectFilter, setSubmissionProjectFilter] =
    useState<'ALL' | string>('ALL');
  const [submissionStartDate, setSubmissionStartDate] = useState('');
  const [submissionEndDate, setSubmissionEndDate] = useState('');
  const [captainMemberFocusId, setCaptainMemberFocusId] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reviewingTicketId, setReviewingTicketId] = useState<string | null>(null);
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
  const [memberTasksPulse, setMemberTasksPulse] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [bugReportText, setBugReportText] = useState('');
  const [isBugReportSending, setIsBugReportSending] = useState(false);
  const [bugReportError, setBugReportError] = useState('');
  const toastIdRef = useRef(1);
  const previousUnseenTaskCountRef = useRef(0);

  const currentUser = authBundle?.user ?? null;
  const isCaptain = currentUser?.role === 'CAPTAIN';
  const isMember = currentUser?.role === 'MEMBER';
  const isBoard = currentUser?.role === 'BOARD';
  const systemProject = projects.find((p) => p.key === 'ULGEN-SYSTEM') ?? projects[0];
  const workspaceProjectCount = projects.filter(
    (project) => project.key !== 'ULGEN-SYSTEM',
  ).length;
  const activeTeamMembers = teamMembers.filter((member) => member.active);
  const filteredTeamMembers = activeTeamMembers.filter((m) => {
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
    const byPriority =
      taskPriorityFilter === 'ALL' || t.priority === taskPriorityFilter;
    const byAssignee =
      taskAssigneeFilter === 'ALL' ||
      t.assignees.some((x) => x.member.id === taskAssigneeFilter);
    return bySearch && byPriority && byAssignee;
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
      .filter((ticket) => ticket.status !== 'IN_REVIEW' && ticket.status !== 'DONE')
      .filter((ticket) =>
        ticket.title.toLowerCase().includes(memberTaskSearch.toLowerCase()),
      );
  }, [tickets, currentUser, memberTaskSearch]);

  const myUnseenTaskCount = useMemo(() => {
    if (!currentUser) return 0;
    return tickets.filter((ticket) =>
      ticket.assignees.some(
        (assignment) => assignment.member.id === currentUser.id && !assignment.seenAt,
      ),
    ).length;
  }, [tickets, currentUser]);

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
  const summaryTaskCount = isCaptain ? captainOpenTaskCount : myActiveTaskCount;
  const meetingDateLabel = useMemo(() => {
    if (!meeting) return '-';
    const date = new Date(meeting.scheduledAt);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR');
  }, [meeting]);

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

  const captainMemberPages = useMemo(() => activeTeamMembers, [activeTeamMembers]);

  const captainFocusedMember = useMemo(
    () => captainMemberPages.find((member) => member.id === captainMemberFocusId) ?? null,
    [captainMemberPages, captainMemberFocusId],
  );

  const captainMemberTickets = useMemo(() => {
    if (!captainFocusedMember) return [] as Ticket[];
    const search = submissionSearch.trim().toLowerCase();
    return tickets
      .filter((ticket) =>
        ticket.assignees.some((assignment) => assignment.member.id === captainFocusedMember.id),
      )
      .filter((ticket) => {
        const latestSubmission = ticket.submissions
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
        const bySearch =
          search.length === 0 ||
          ticket.title.toLowerCase().includes(search) ||
          (ticket.description ?? '').toLowerCase().includes(search) ||
          (latestSubmission?.fileName.toLowerCase().includes(search) ?? false);
        const byProject =
          submissionProjectFilter === 'ALL' || ticket.projectId === submissionProjectFilter;
        const refMs = new Date(
          latestSubmission?.createdAt ?? ticket.createdAt ?? new Date(0).toISOString(),
        ).getTime();
        const byStart =
          !submissionStartDate ||
          refMs >= new Date(`${submissionStartDate}T00:00:00`).getTime();
        const byEnd =
          !submissionEndDate ||
          refMs <= new Date(`${submissionEndDate}T23:59:59.999`).getTime();
        return bySearch && byProject && byStart && byEnd;
      })
      .sort((a, b) => {
        const aLatest = a.submissions
          .slice()
          .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
        const bLatest = b.submissions
          .slice()
          .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
        const aMs = new Date(
          aLatest?.createdAt ?? a.createdAt ?? new Date(0).toISOString(),
        ).getTime();
        const bMs = new Date(
          bLatest?.createdAt ?? b.createdAt ?? new Date(0).toISOString(),
        ).getTime();
        return bMs - aMs;
      });
  }, [
    captainFocusedMember,
    submissionSearch,
    submissionProjectFilter,
    submissionStartDate,
    submissionEndDate,
    tickets,
  ]);

  const captainActiveMemberTickets = useMemo(
    () => captainMemberTickets.filter((ticket) => ticket.status !== 'DONE'),
    [captainMemberTickets],
  );

  const captainArchivedTickets = useMemo(
    () => captainMemberTickets.filter((ticket) => ticket.status === 'DONE'),
    [captainMemberTickets],
  );

  const captainAssignableTickets = useMemo(() => {
    const search = taskSearch.trim().toLowerCase();
    return tickets
      .filter((ticket) => ticket.assignees.length === 0)
      .filter((ticket) => {
        const bySearch =
          search.length === 0 ||
          ticket.title.toLowerCase().includes(search) ||
          (ticket.description ?? '').toLowerCase().includes(search);
        const byPriority =
          taskPriorityFilter === 'ALL' || ticket.priority === taskPriorityFilter;
        return bySearch && byPriority;
      });
  }, [tickets, taskSearch, taskPriorityFilter]);

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
    if (path.startsWith('/meetings') && upperMethod !== 'GET') {
      throw new Error('Toplanti ayarlari sadece kaptan icindir.');
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
    const [projectData, memberData, ticketData, meetingData] = await Promise.all([
      apiFetch('/projects'),
      apiFetch('/team-members'),
      apiFetch('/tickets'),
      apiFetch('/meetings/current'),
    ]);
    setProjects(projectData);
    setTeamMembers(memberData);
    setTickets(ticketData);
    const nextMeeting = (meetingData as { meeting?: MeetingInfo | null }).meeting ?? null;
    setMeeting(nextMeeting);
    setMeetingScheduledAt(nextMeeting ? toDatetimeLocalValue(nextMeeting.scheduledAt) : '');
    setMeetingUrl(nextMeeting?.meetingUrl ?? '');
    setMeetingNote(nextMeeting?.note ?? '');
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
      setMemberTab('home');
      setTeamRoleFilter('ALL');
      setCaptainTab('home');
      return;
    }
    if (currentUser.role === 'BOARD') {
      setMemberTab('home');
    }
    if (currentUser.role === 'MEMBER') {
      setMemberTab('home');
    }
  }, [currentUser]);

  useEffect(() => {
    if (captainMemberPages.length === 0) {
      setCaptainMemberFocusId('');
      return;
    }
    const exists = captainMemberPages.some((member) => member.id === captainMemberFocusId);
    if (!exists) {
      setCaptainMemberFocusId(captainMemberPages[0].id);
    }
  }, [captainMemberPages, captainMemberFocusId]);

  useEffect(() => {
    const validIds = new Set(tickets.map((t) => t.id));
    setSelectedTicketIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [tickets]);

  useEffect(() => {
    if (!authBundle || loading || !currentUser) return;
    if (!isMember || memberTab !== 'my_tasks') return;

    const unseenTicketIds = myTickets
      .filter((ticket) =>
        ticket.assignees.some(
          (assignment) => assignment.member.id === currentUser.id && !assignment.seenAt,
        ),
      )
      .map((ticket) => ticket.id);

    if (unseenTicketIds.length === 0) return;

    const seenAt = new Date().toISOString();
    void apiFetch('/tickets/seen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketIds: unseenTicketIds }),
    })
      .then(() => {
        setTickets((prev) =>
          prev.map((ticket) => {
            if (!unseenTicketIds.includes(ticket.id)) return ticket;
            return {
              ...ticket,
              assignees: ticket.assignees.map((assignment) =>
                assignment.member.id === currentUser.id && !assignment.seenAt
                  ? { ...assignment, seenAt }
                  : assignment,
              ),
            };
          }),
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [authBundle, loading, currentUser, isMember, memberTab, myTickets]);

  useEffect(() => {
    if (!isMember) {
      previousUnseenTaskCountRef.current = 0;
      setMemberTasksPulse(false);
      return;
    }
    if (myUnseenTaskCount > previousUnseenTaskCountRef.current) {
      setMemberTasksPulse(true);
      const timer = setTimeout(() => setMemberTasksPulse(false), 1800);
      previousUnseenTaskCountRef.current = myUnseenTaskCount;
      return () => clearTimeout(timer);
    }
    previousUnseenTaskCountRef.current = myUnseenTaskCount;
  }, [isMember, myUnseenTaskCount]);

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
    setCaptainTab('home');
    setMemberTab('home');
    setIntroStage('none');
    showToast('success', 'Oturum kapatıldı');
  }

  async function submitBugReport(e: FormEvent) {
    e.preventDefault();
    if (isBugReportSending) return;
    const description = bugReportText.trim();
    if (description.length < 10) {
      setBugReportError('Lutfen en az 10 karakterlik bir aciklama yazin.');
      return;
    }

    try {
      setIsBugReportSending(true);
      setBugReportError('');
      const res = await fetch(`${API_URL}/auth/bug-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          description,
          userName: currentUser?.name,
          userEmail: currentUser?.email,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        }),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      setBugReportText('');
      setIsBugReportOpen(false);
      showToast('success', 'Hata raporu gonderildi.');
    } catch (error) {
      const message =
        error instanceof TypeError ? NETWORK_ERROR_MESSAGE : (error as Error).message;
      setBugReportError(message);
    } finally {
      setIsBugReportSending(false);
    }
  }

  async function saveMeetingPlan(e: FormEvent) {
    e.preventDefault();
    setMeetingFieldError('');
    const scheduled = new Date(meetingScheduledAt);
    if (Number.isNaN(scheduled.getTime())) {
      setMeetingFieldError('Toplanti tarihi ve saati zorunludur.');
      return;
    }
    if (scheduled.getTime() <= Date.now() + 15 * 60 * 1000) {
      setMeetingFieldError('Toplanti en az 15 dakika sonrasina planlanmalidir.');
      return;
    }
    const trimmedUrl = meetingUrl.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setMeetingFieldError('Toplanti linki http:// veya https:// ile baslamalidir.');
      return;
    }

    setIsSavingMeeting(true);
    try {
      const result = (await apiFetch('/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: scheduled.toISOString(),
          meetingUrl: trimmedUrl,
          note: meetingNote.trim() || undefined,
        }),
      })) as { meeting: MeetingInfo };
      setMeeting(result.meeting);
      setMeetingScheduledAt(toDatetimeLocalValue(result.meeting.scheduledAt));
      setMeetingUrl(result.meeting.meetingUrl);
      setMeetingNote(result.meeting.note ?? '');
      showToast('success', 'Toplanti planlandi.');
    } catch (error) {
      setMeetingFieldError(error instanceof Error ? error.message : 'Toplanti planlanamadi.');
    } finally {
      setIsSavingMeeting(false);
    }
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
    const draft: TicketCreateDraft = {
      title: ticketTitle.trim(),
      description: ticketDesc || '',
      priority: ticketPriority,
      dueAt: ticketDueAt,
      primaryAssigneeId: ticketPrimaryAssigneeId,
      secondaryAssigneeId: ticketSecondaryAssigneeId,
      attachmentFile: ticketAttachmentFile,
      attachmentNote: ticketAttachmentNote,
    };
    const validationError = validateTicketCreateDraft(draft);
    if (validationError) {
      setTicketFieldError(validationError);
      return;
    }

    try {
      setIsCreatingTicket(true);
      await apiFetch('/tickets', {
        method: 'POST',
        body: buildCreateTicketFormData(draft),
      });
      setTicketTitle('');
      setTicketDesc('');
      setTicketPriority('MEDIUM');
      setTicketDueAt('');
      setTicketPrimaryAssigneeId('');
      setTicketSecondaryAssigneeId('');
      setTicketAttachmentFile(null);
      setTicketAttachmentNote('');
      await loadAll();
      showToast('success', 'Gorev olusturuldu');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreatingTicket(false);
    }
  }

  async function updateTicketAssignees(ticket: Ticket, assigneeIds: string[]) {
    if (!isCaptain) return;
    setError('');
    const uniqueAssigneeIds = normalizeAssigneeIds(assigneeIds);
    if (uniqueAssigneeIds.length < 1) {
      const message = 'Gorev en az 1 kisiye atanmali';
      setError(message);
      showToast('error', message);
      return;
    }
    if (uniqueAssigneeIds.length > 2) {
      const message = 'En fazla 2 kisi atanabilir';
      setError(message);
      showToast('error', message);
      return;
    }

    try {
      await apiFetch(`/tickets/${ticket.id}/assignee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeIds: uniqueAssigneeIds }),
      });
      await loadAll();
      showToast('success', 'Atananlar guncellendi');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteTicket(ticket: Ticket) {
    if (!isCaptain) return;
    const ok = window.confirm('Emin misin?');
    if (!ok) return;
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
        lateReason: prev[ticketId]?.lateReason ?? '',
        file: prev[ticketId]?.file ?? null,
        ...patch,
      },
    }));
  }

  function setCaptainFileDraft(ticketId: string, patch: Partial<CaptainFileDraft>) {
    setCaptainFileDrafts((prev) => ({
      ...prev,
      [ticketId]: {
        note: prev[ticketId]?.note ?? '',
        submittedForMemberId: prev[ticketId]?.submittedForMemberId ?? '',
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
    if (isBoard) {
      showToast('error', 'Yonetim kurulu teslim gonderemez');
      return;
    }
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
    const dueAtMs = ticket.dueAt ? new Date(ticket.dueAt).getTime() : null;
    const isLate = typeof dueAtMs === 'number' && !Number.isNaN(dueAtMs) && Date.now() > dueAtMs;
    const lateReason = draft.lateReason?.trim() ?? '';
    if (isLate && lateReason.length < 3) {
      setUploadFieldError(ticket.id, 'Son teslim tarihi gecildigi icin mazeret girmek zorunludur');
      return;
    }
    setError('');
    try {
      setUploadingTicketId(ticket.id);
      const form = new FormData();
      form.set('submittedById', currentUser.id);
      form.set('note', draft.note);
      if (lateReason.length > 0) {
        form.set('lateReason', lateReason);
      }
      form.set('file', draft.file);
      await apiFetch(`/tickets/${ticket.id}/submissions`, {
        method: 'POST',
        body: form,
      });
      setUpload(ticket.id, { note: '', lateReason: '', file: null });
      clearUploadFieldError(ticket.id);
      await loadAll();
      showToast('success', 'Teslim gönderildi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingTicketId((prev) => (prev === ticket.id ? null : prev));
    }
  }

  function getLatestSubmission(ticket: Ticket) {
    return (
      ticket.submissions
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ??
      null
    );
  }

  async function sendCaptainFile(ticket: Ticket) {
    if (!isCaptain) return;
    if (uploadingCaptainFileTicketId === ticket.id) return;

    const draft = captainFileDrafts[ticket.id];
    if (!draft?.file) {
      setError('Dosya secmeden gonderemezsin');
      return;
    }
    if (draft.file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError('Maksimum dosya boyutu 25 MB olabilir');
      return;
    }
    const ext = draft.file.name.toLowerCase().split('.').pop() ?? '';
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      setError('Sadece PDF, DOC, DOCX, PPT, PPTX kabul edilir');
      return;
    }

    setError('');
    try {
      setUploadingCaptainFileTicketId(ticket.id);
      const form = new FormData();
      form.set('file', draft.file);
      form.set('note', draft.note ?? '');
      if (draft.submittedForMemberId) {
        form.set('submittedForMemberId', draft.submittedForMemberId);
      }
      await apiFetch(`/tickets/${ticket.id}/captain-files`, {
        method: 'POST',
        body: form,
      });
      setCaptainFileDraft(ticket.id, { file: null, note: '', submittedForMemberId: '' });
      await loadAll();
      showToast('success', 'Dosya uyeye iletildi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingCaptainFileTicketId((prev) => (prev === ticket.id ? null : prev));
    }
  }

  function isOnTimeSubmission(ticket: Ticket, submission: Submission) {
    if (!ticket.dueAt) return true;
    const dueMs = new Date(ticket.dueAt).getTime();
    const submitMs = new Date(submission.createdAt).getTime();
    if (Number.isNaN(dueMs) || Number.isNaN(submitMs)) return true;
    return submitMs <= dueMs;
  }

  function setReviewReason(ticketId: string, value: string) {
    setReviewReasons((prev) => ({ ...prev, [ticketId]: value }));
  }

  async function reviewTicket(ticket: Ticket, action: 'APPROVE' | 'REJECT') {
    if (!isCaptain || reviewingTicketId === ticket.id) return;
    const reason = (reviewReasons[ticket.id] ?? '').trim();
    if (action === 'REJECT' && reason.length < 3) {
      setError('Teslim ret icin en az 3 karakter aciklama gir');
      return;
    }
    setError('');
    try {
      setReviewingTicketId(ticket.id);
      await apiFetch(`/tickets/${ticket.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'REJECT' ? { reason } : {}),
        }),
      });
      setReviewReasons((prev) => {
        if (!prev[ticket.id]) return prev;
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
      await loadAll();
      showToast(
        'success',
        action === 'APPROVE' ? 'Teslim onaylandi ve arsive alindi' : 'Teslim reddedildi ve gorev geri acildi',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewingTicketId((prev) => (prev === ticket.id ? null : prev));
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
          <Link href="/forgot-password" className="textBtn inlineLink">
            Sifremi unuttum
          </Link>
        </section>
        <section className="loginWideImage" aria-label="Giris alt gorseli" />
        <button
          type="button"
          className="bugFab"
          aria-label="Hata raporu gonder"
          onClick={() => {
            setBugReportError('');
            setIsBugReportOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14 5h2a1 1 0 0 0 0-2h-2.18A3 3 0 0 0 12 2a3 3 0 0 0-1.82 1H8a1 1 0 1 0 0 2h2v1.08A6.5 6.5 0 0 0 6.26 9H4a1 1 0 0 0 0 2h1.51a8.29 8.29 0 0 0-.01 2H4a1 1 0 0 0 0 2h2.26A6.5 6.5 0 0 0 10 17.92V20a1 1 0 1 0 2 0v-2.08A6.5 6.5 0 0 0 17.74 15H20a1 1 0 1 0 0-2h-1.5a8.29 8.29 0 0 0 0-2H20a1 1 0 1 0 0-2h-2.26A6.5 6.5 0 0 0 14 6.08V5Zm-2-1a1 1 0 0 1 1 1v1h-2V5a1 1 0 0 1 1-1Zm0 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
            />
          </svg>
        </button>
        {isBugReportOpen && (
          <div className="bugModalBackdrop" role="dialog" aria-modal="true">
            <section className="bugModal panel">
              <h3>Hata Raporu Gonder</h3>
              <p className="muted">
                Aciklamaniz e-posta ile mustafa.din067@gmail.com adresine gonderilir.
              </p>
              <form className="formBlock" onSubmit={submitBugReport}>
                <textarea
                  value={bugReportText}
                  onChange={(event) => {
                    setBugReportText(event.target.value);
                    setBugReportError('');
                  }}
                  placeholder="Karsilastiginiz sorunu adim adim yazin..."
                  required
                />
                {bugReportError && <p className="fieldError">{bugReportError}</p>}
                <div className="bugModalActions">
                  <button
                    type="button"
                    className="bugSecondaryBtn"
                    onClick={() => setIsBugReportOpen(false)}
                    disabled={isBugReportSending}
                  >
                    Vazgec
                  </button>
                  <button type="submit" disabled={isBugReportSending}>
                    {isBugReportSending ? 'Gonderiliyor...' : 'Gonder'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
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
            <strong>{workspaceProjectCount}</strong>
          </article>
          <article className="statCard">
            <span>Görev</span>
            <strong>{summaryTaskCount}</strong>
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
            <h3>Bildirim Geçmişi</h3>
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
            <p className="muted">Henüz bildirim yok.</p>
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
                <button type="button" className={captainTab === 'home' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('home')}><span>Anasayfa</span>{captainTab === 'home' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'meeting' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('meeting')}><span>Toplanti Ayarlar</span>{captainTab === 'meeting' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'overview' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('overview')}><span>Genel</span>{captainTab === 'overview' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'team' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('team')}><span>Takim</span>{captainTab === 'team' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('tasks')}><span>Gorevler</span>{captainTab === 'tasks' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('submissions')}><span>Kisi Sayfalari</span>{captainTab === 'submissions' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
              </div>
            </LayoutGroup>
          ) : (
                        <LayoutGroup id="member-tabs">
              <div className="tabStack">
                <button
                  type="button"
                  className={memberTab === 'home' ? 'tabBtn active' : 'tabBtn'}
                  onClick={() => setMemberTab('home')}
                >
                  <span>Anasayfa</span>
                  {memberTab === 'home' && (
                    <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />
                  )}
                </button>
                <button
                  type="button"
                  className={`tabBtn ${memberTab === 'my_tasks' ? 'active' : ''} ${
                    memberTasksPulse ? 'tabPulse' : ''
                  }`}
                  onClick={() => setMemberTab('my_tasks')}
                >
                  <span>Aktif Gorevlerim</span>
                  <b className={`tabCountBadge ${myUnseenTaskCount > 0 ? 'hot' : ''}`}>
                    {myUnseenTaskCount}
                  </b>
                  {memberTab === 'my_tasks' && (
                    <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />
                  )}
                </button>
                <button type="button" className={memberTab === 'my_submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_submissions')}><span>Teslimlerim</span>{memberTab === 'my_submissions' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'timeline' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('timeline')}><span>Akis</span>{memberTab === 'timeline' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
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
          {!loading && isCaptain && captainTab === 'home' && (
            <motion.div
              key="captain-home"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="cardGrid">
                <article className="infoCard">
                  <h3>Anasayfa</h3>
                  <p>{meeting ? 'Planli toplanti var.' : 'Planli toplanti yok.'}</p>
                  <p className="muted">
                    {meeting
                      ? `Tarih: ${meetingDateLabel}`
                      : 'Toplanti ayarlari sekmesinden planlama yapabilirsiniz.'}
                  </p>
                </article>
                <article className="infoCard">
                  <h3>Toplanti Linki</h3>
                  {meeting ? (
                    <a href={meeting.meetingUrl} target="_blank" rel="noreferrer">
                      {meeting.meetingUrl}
                    </a>
                  ) : (
                    <p className="muted">Henuz link eklenmedi.</p>
                  )}
                </article>
              </div>
              {meeting?.note && (
                <article className="infoCard">
                  <h3>Toplanti Notu</h3>
                  <p>{meeting.note}</p>
                </article>
              )}
            </motion.div>
          )}
          {!loading && isCaptain && captainTab === 'meeting' && (
            <motion.div
              key="captain-meeting"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <form className="formBlock" onSubmit={saveMeetingPlan}>
                <h3>Toplanti Planla</h3>
                <input
                  type="datetime-local"
                  value={meetingScheduledAt}
                  onChange={(e) => {
                    setMeetingScheduledAt(e.target.value);
                    setMeetingFieldError('');
                  }}
                  required
                />
                <input
                  placeholder="Toplanti linki (https://...)"
                  value={meetingUrl}
                  onChange={(e) => {
                    setMeetingUrl(e.target.value);
                    setMeetingFieldError('');
                  }}
                  required
                />
                <textarea
                  placeholder="Toplanti notu (istege bagli)"
                  value={meetingNote}
                  onChange={(e) => {
                    setMeetingNote(e.target.value);
                    setMeetingFieldError('');
                  }}
                />
                {meetingFieldError && <p className="fieldError">{meetingFieldError}</p>}
                <button type="submit" disabled={isSavingMeeting}>
                  {isSavingMeeting ? 'Kaydediliyor...' : 'Toplantiyi Planla'}
                </button>
              </form>
              <p className="muted">
                Toplanti saatine 15 dakika kala aktif tum kullanicilara e-posta hatirlatmasi
                gonderilir.
              </p>
            </motion.div>
          )}
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
                  Kaptan {activeTeamMembers.filter((x) => x.role === 'CAPTAIN').length} | Kurul{' '}
                  {activeTeamMembers.filter((x) => x.role === 'BOARD').length} | Üye{' '}
                  {activeTeamMembers.filter((x) => x.role === 'MEMBER').length}
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
                  placeholder="Gorev ara"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
                <select
                  value={taskPriorityFilter}
                  onChange={(e) =>
                    setTaskPriorityFilter(e.target.value as 'ALL' | TicketPriority)
                  }
                >
                  <option value="ALL">Tum Oncelikler</option>
                  <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                  <option value="MEDIUM">{PRIORITY_LABELS.MEDIUM}</option>
                  <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                  <option value="CRITICAL">{PRIORITY_LABELS.CRITICAL}</option>
                </select>
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
                <input
                  type="datetime-local"
                  value={ticketDueAt}
                  onChange={(e) => setTicketDueAt(e.target.value)}
                  required
                />
                <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}>
                  <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                  <option value="MEDIUM">{PRIORITY_LABELS.MEDIUM}</option>
                  <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                  <option value="CRITICAL">{PRIORITY_LABELS.CRITICAL}</option>
                </select>
                <select
                  value={ticketPrimaryAssigneeId}
                  onChange={(e) => {
                    const nextPrimary = e.target.value;
                    setTicketPrimaryAssigneeId(nextPrimary);
                    if (ticketSecondaryAssigneeId === nextPrimary) {
                      setTicketSecondaryAssigneeId('');
                    }
                  }}
                  required
                >
                  <option value="">1. atanan (zorunlu)</option>
                  {activeTeamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  value={ticketSecondaryAssigneeId}
                  onChange={(e) => setTicketSecondaryAssigneeId(e.target.value)}
                >
                  <option value="">2. atanan (opsiyonel)</option>
                  {activeTeamMembers
                    .filter((m) => m.id !== ticketPrimaryAssigneeId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) =>
                    setTicketAttachmentFile(
                      e.currentTarget.files && e.currentTarget.files[0]
                        ? e.currentTarget.files[0]
                        : null,
                    )
                  }
                />
                <textarea
                  placeholder="Dosya notu (opsiyonel)"
                  value={ticketAttachmentNote}
                  onChange={(e) => setTicketAttachmentNote(e.target.value)}
                />
                {ticketFieldError && <p className="fieldError">{ticketFieldError}</p>}
                <button type="submit" disabled={isCreatingTicket}>
                  {isCreatingTicket ? 'Olusturuluyor...' : 'Gorev Olustur'}
                </button>
              </form>

              <div className="ticketStack">
                {captainAssignableTickets.map((ticket) => (
                  <article key={ticket.id} className="ticketCard">
                    <strong>{ticket.title}</strong>
                    <p>{ticket.description || '-'}</p>
                    <p className="muted">
                      Son teslim tarihi: {ticket.dueAt ? new Date(ticket.dueAt).toLocaleString('tr-TR') : '-'}
                    </p>
                    <div className="ticketMeta">
                      <span>{PRIORITY_LABELS[ticket.priority]}</span>
                      <span>{STATUS_LABELS[ticket.status]}</span>
                    </div>
                    <p className="muted">
                      Atananlar:{' '}
                      {ticket.assignees
                        .map((x) => `${x.member.name} (${x.seenAt ? 'goruldu' : 'gorulmedi'})`)
                        .join(', ') || 'Yok'}
                    </p>
                    <div className="projectActions">
                      <select
                        multiple
                        value={ticket.assignees.map((x) => x.member.id)}
                        onChange={(e) => {
                          const next = Array.from(
                            e.currentTarget.selectedOptions,
                          ).map((o) => o.value);
                          if (next.length > 2) {
                            setError('En fazla 2 kisi atanabilir');
                            showToast('error', 'En fazla 2 kisi atanabilir');
                            return;
                          }
                          void updateTicketAssignees(ticket, next);
                        }}
                      >
                        {activeTeamMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => deleteTicket(ticket)}>
                        Gorevi Sil
                      </button>
                    </div>
                  </article>
                ))}
                {captainAssignableTickets.length === 0 && (
                  <p className="muted">Atanmayi bekleyen gorev bulunamadi.</p>
                )}
              </div>
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
                  {captainMemberPages.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Teslim veya gorev ara"
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                />
                <select
                  value={submissionProjectFilter}
                  onChange={(e) => setSubmissionProjectFilter(e.target.value)}
                >
                  <option value="ALL">Tum Projeler</option>
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
                  aria-label="Baslangic tarihi"
                />
                <input
                  type="date"
                  value={submissionEndDate}
                  onChange={(e) => setSubmissionEndDate(e.target.value)}
                  aria-label="Bitis tarihi"
                />
              </div>

              {!captainFocusedMember && <p className="muted">Uye secimi yapilmadi.</p>}

              {captainFocusedMember && (
                <>
                  <div className="panelHead">
                    <h2>{captainFocusedMember.name} - Bekleyen Teslimler</h2>
                  </div>
                  <div className="ticketStack">
                    {captainActiveMemberTickets.map((ticket) => {
                      const latestSubmission = getLatestSubmission(ticket);
                      const seenInfo = ticket.assignees.find(
                        (assignment) => assignment.member.id === captainFocusedMember.id,
                      );
                      return (
                        <article key={ticket.id} className="ticketCard">
                          <strong>{ticket.title}</strong>
                          <p>{ticket.description || '-'}</p>
                          <p className="muted">
                            Durum: {STATUS_LABELS[ticket.status]} | Gorulme:{' '}
                            {seenInfo?.seenAt
                              ? new Date(seenInfo.seenAt).toLocaleString('tr-TR')
                              : 'Henuz gorulmedi'}
                          </p>
                          {!latestSubmission && (
                            <p className="muted">Bu gorev icin henuz teslim yapilmadi.</p>
                          )}
                          {latestSubmission && (
                            <>
                          <p className="muted">
                            Son teslim tarihi:{' '}
                            {ticket.dueAt ? new Date(ticket.dueAt).toLocaleString('tr-TR') : '-'}
                          </p>
                          <p className="muted">
                            Teslim zamani: {new Date(latestSubmission.createdAt).toLocaleString('tr-TR')}
                            <span className={`deadlineBadge ${isOnTimeSubmission(ticket, latestSubmission) ? 'onTime' : 'late'}`}>
                              {isOnTimeSubmission(ticket, latestSubmission) ? 'Zamaninda' : 'Gec teslim'}
                            </span>
                          </p>
                          <p className="muted">
                            Dosya: {latestSubmission.fileName}
                            {latestSubmission.note ? ` | Aciklama: ${latestSubmission.note}` : ''}
                          </p>
                          {latestSubmission.lateReason && (
                            <p className="fieldError">Gec teslim mazereti: {latestSubmission.lateReason}</p>
                          )}
                            </>
                          )}
                          <div className="quickRow">
                            <button
                              type="button"
                              onClick={() => latestSubmission && downloadSubmission(latestSubmission)}
                              disabled={!latestSubmission}
                            >
                              Dosyayi Indir
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewTicket(ticket, 'APPROVE')}
                              disabled={reviewingTicketId === ticket.id || !latestSubmission || ticket.status !== 'IN_REVIEW'}
                            >
                              {reviewingTicketId === ticket.id ? 'Isleniyor...' : 'Teslim onay'}
                            </button>
                          </div>
                          <div className="submissionBox">
                            <input
                              placeholder="Teslim ret sebebi"
                              value={reviewReasons[ticket.id] ?? ''}
                              onChange={(e) => setReviewReason(ticket.id, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => reviewTicket(ticket, 'REJECT')}
                              disabled={reviewingTicketId === ticket.id || !latestSubmission || ticket.status !== 'IN_REVIEW'}
                            >
                              Teslim ret
                            </button>
                          </div>
                          <div className="submissionBox">
                            <h4>Uyeye Dosya Gonder</h4>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.ppt,.pptx"
                              onChange={(e) =>
                                setCaptainFileDraft(ticket.id, {
                                  file:
                                    e.currentTarget.files && e.currentTarget.files[0]
                                      ? e.currentTarget.files[0]
                                      : null,
                                })
                              }
                              disabled={uploadingCaptainFileTicketId === ticket.id}
                            />
                            <input
                              placeholder="Not"
                              value={captainFileDrafts[ticket.id]?.note ?? ''}
                              onChange={(e) =>
                                setCaptainFileDraft(ticket.id, { note: e.target.value })
                              }
                            />
                            <select
                              value={captainFileDrafts[ticket.id]?.submittedForMemberId ?? ''}
                              onChange={(e) =>
                                setCaptainFileDraft(ticket.id, {
                                  submittedForMemberId: e.target.value,
                                })
                              }
                              disabled={uploadingCaptainFileTicketId === ticket.id}
                            >
                              <option value="">Tum atanmis uyelere gonder</option>
                              {ticket.assignees.map((assignment) => (
                                <option key={assignment.member.id} value={assignment.member.id}>
                                  {assignment.member.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => sendCaptainFile(ticket)}
                              disabled={uploadingCaptainFileTicketId === ticket.id}
                            >
                              {uploadingCaptainFileTicketId === ticket.id
                                ? 'Gonderiliyor...'
                                : 'Dosya Gonder'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {captainActiveMemberTickets.length === 0 && (
                      <p className="muted">Bu uye icin aktif gorev yok.</p>
                    )}
                  </div>

                  <div className="panelHead">
                    <h2>{captainFocusedMember.name} - Arsiv</h2>
                  </div>
                  <ul className="submissionRows">
                    {captainArchivedTickets.map((ticket) => {
                      const latestSubmission = getLatestSubmission(ticket);
                      if (!latestSubmission) return null;
                      return (
                        <li key={ticket.id}>
                          <div>
                            <strong>{ticket.title}</strong>
                            <span className={`fileBadge type-${getFileTypeLabel(latestSubmission.fileName).toLowerCase()}`}>
                              {getFileTypeLabel(latestSubmission.fileName)}
                            </span>
                            <p>
                              {latestSubmission.fileName} | Onay: {ticket.completedAt ? new Date(ticket.completedAt).toLocaleString('tr-TR') : '-'}
                            </p>
                          </div>
                          <div className="archiveActions">
                            <button type="button" onClick={() => downloadSubmission(latestSubmission)}>
                              Indir
                            </button>
                            <button type="button" onClick={() => deleteTicket(ticket)}>
                              Gorevi Sil
                            </button>
                          </div>
                        </li>
                      );
                    })}
                    {captainArchivedTickets.length === 0 && (
                      <p className="muted">Bu uye icin arsiv kaydi yok.</p>
                    )}
                  </ul>
                </>
              )}
            </motion.div>
          )}
          {!loading && !isCaptain && memberTab === 'home' && (
            <motion.div
              key="member-home"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="cardGrid">
                <article className="infoCard">
                  <h3>Anasayfa</h3>
                  <p>{meeting ? 'Planli toplanti var.' : 'Planli toplanti yok.'}</p>
                  <p className="muted">
                    {meeting
                      ? `Tarih: ${meetingDateLabel}`
                      : 'Yeni bir toplanti planlanmadiginda bu alan bos kalir.'}
                  </p>
                </article>
                <article className="infoCard">
                  <h3>Toplanti Linki</h3>
                  {meeting ? (
                    <a href={meeting.meetingUrl} target="_blank" rel="noreferrer">
                      {meeting.meetingUrl}
                    </a>
                  ) : (
                    <p className="muted">Toplanti linki bekleniyor.</p>
                  )}
                </article>
              </div>
              {meeting?.note && (
                <article className="infoCard">
                  <h3>Toplanti Notu</h3>
                  <p>{meeting.note}</p>
                </article>
              )}
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
                  placeholder="Gorev ara"
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
                      <span>{STATUS_LABELS[ticket.status]}</span>
                    </div>
                    {ticket.reviewNote && (
                      <p className="fieldError">Teslim ret sebebi: {ticket.reviewNote}</p>
                    )}
                    {ticket.submissions.filter((submission) => submission.submittedBy.role === 'CAPTAIN').length > 0 && (
                      <div className="submissionBox">
                        <h4>Kaptandan Gelen Dosyalar</h4>
                        {ticket.submissions
                          .filter((submission) => submission.submittedBy.role === 'CAPTAIN')
                          .map((submission) => (
                            <button
                              key={submission.id}
                              type="button"
                              onClick={() => downloadSubmission(submission)}
                            >
                              {submission.fileName}
                            </button>
                          ))}
                      </div>
                    )}
                    {!isBoard ? (
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
                          disabled={uploadingTicketId === ticket.id}
                        />
                        <input placeholder="Not" value={uploadDrafts[ticket.id]?.note ?? ''} onChange={(e) => setUpload(ticket.id, { note: e.target.value })} />
                        {ticket.dueAt && new Date(ticket.dueAt).getTime() < Date.now() && (
                          <input
                            placeholder="Gec teslim mazereti (zorunlu)"
                            value={uploadDrafts[ticket.id]?.lateReason ?? ''}
                            onChange={(e) => setUpload(ticket.id, { lateReason: e.target.value })}
                          />
                        )}
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
                    ) : (
                      <div className="submissionBox">
                        <h4>Teslim Dosyasi</h4>
                        <p className="muted">Yonetim kurulu bu alanda sadece goruntuleme yetkisine sahiptir.</p>
                      </div>
                    )}
                  </article>
                ))}
                {myTickets.length === 0 && <p className="muted">Uzerinde calistigin gorev yok.</p>}
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
      <button
        type="button"
        className="bugFab"
        aria-label="Hata raporu gonder"
        onClick={() => {
          setBugReportError('');
          setIsBugReportOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M14 5h2a1 1 0 0 0 0-2h-2.18A3 3 0 0 0 12 2a3 3 0 0 0-1.82 1H8a1 1 0 1 0 0 2h2v1.08A6.5 6.5 0 0 0 6.26 9H4a1 1 0 0 0 0 2h1.51a8.29 8.29 0 0 0-.01 2H4a1 1 0 0 0 0 2h2.26A6.5 6.5 0 0 0 10 17.92V20a1 1 0 1 0 2 0v-2.08A6.5 6.5 0 0 0 17.74 15H20a1 1 0 1 0 0-2h-1.5a8.29 8.29 0 0 0 0-2H20a1 1 0 1 0 0-2h-2.26A6.5 6.5 0 0 0 14 6.08V5Zm-2-1a1 1 0 0 1 1 1v1h-2V5a1 1 0 0 1 1-1Zm0 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
          />
        </svg>
      </button>
      {isBugReportOpen && (
        <div className="bugModalBackdrop" role="dialog" aria-modal="true">
          <section className="bugModal panel">
            <h3>Hata Raporu Gonder</h3>
            <p className="muted">
              Aciklamaniz e-posta ile mustafa.din067@gmail.com adresine gonderilir.
            </p>
            <form className="formBlock" onSubmit={submitBugReport}>
              <textarea
                value={bugReportText}
                onChange={(event) => {
                  setBugReportText(event.target.value);
                  setBugReportError('');
                }}
                placeholder="Karsilastiginiz sorunu adim adim yazin..."
                required
              />
              {bugReportError && <p className="fieldError">{bugReportError}</p>}
              <div className="bugModalActions">
                <button
                  type="button"
                  className="bugSecondaryBtn"
                  onClick={() => setIsBugReportOpen(false)}
                  disabled={isBugReportSending}
                >
                  Vazgec
                </button>
                <button type="submit" disabled={isBugReportSending}>
                  {isBugReportSending ? 'Gonderiliyor...' : 'Gonder'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}





















