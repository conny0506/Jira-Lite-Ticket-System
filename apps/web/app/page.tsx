'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring } from 'framer-motion';
import Link from 'next/link';
import type { Options as DocxPreviewOptions } from 'docx-preview';
import { KanbanBoard } from './components/KanbanBoard';
import { DashboardCharts } from './components/DashboardCharts';
import { CalendarView } from './components/CalendarView';
import { AuditLogFeed } from './components/AuditLogFeed';
import { ScoreRing } from './components/ScoreRing';

type TeamRole = 'MEMBER' | 'BOARD' | 'CAPTAIN' | 'RD_LEADER';
type Department = 'SOFTWARE' | 'INDUSTRIAL' | 'MECHANICAL' | 'ELECTRICAL_ELECTRONICS';
type MeetingTargetMode = 'ALL' | 'SELECTED';
type TicketStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  isIntern?: boolean;
  departments?: Array<{ department: Department }>;
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

type CommentReaction = {
  emoji: string;
  member: { id: string; name: string };
};

type TicketDependency = {
  dependsOn: { id: string; title: string; status: TicketStatus };
};

type TicketTemplate = {
  id: string;
  title: string;
  description?: string | null;
  priority: TicketPriority;
  createdAt: string;
  createdBy: { id: string; name: string };
};

type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; role: TeamRole };
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
  dependencies?: TicketDependency[];
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
  includeInterns?: boolean;
  targetMode?: MeetingTargetMode;
  targetDepartments?: Department[];
  reminderSentAt?: string | null;
  createdBy: Pick<TeamMember, 'id' | 'name' | 'email'>;
};

type CaptainTab =
  | 'home'
  | 'meeting'
  | 'overview'
  | 'team'
  | 'tasks'
  | 'kanban'
  | 'calendar'
  | 'audit'
  | 'submissions'
  | 'announcements'
  | 'leaves'
  | 'settings';
type MemberTab =
  | 'home'
  | 'my_tasks'
  | 'my_submissions'
  | 'timeline'
  | 'calendar'
  | 'all_tasks'
  | 'announcements'
  | 'my_leaves'
  | 'settings';

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; role: TeamRole };
};

type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type Leave = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  reviewNote?: string | null;
  createdAt: string;
  member?: { id: string; name: string; role: TeamRole };
  reviewedBy?: { id: string; name: string } | null;
};
type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: TeamRole };
  reactions?: CommentReaction[];
};

type ToastItem = { id: number; type: 'success' | 'error'; message: string };
type NotificationItem = ToastItem & { createdAt: string };
type IntroStage = 'none' | 'terminal' | 'quote';
type QuoteApiResponse = { quote?: { id: string; text: string } | null };

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '✅'];

type CommentPanelProps = {
  ticketId: string;
  openCommentTicketId: string | null;
  commentLoadingTicketId: string | null;
  submittingCommentTicketId: string | null;
  ticketComments: Record<string, Comment[]>;
  commentDrafts: Record<string, string>;
  onToggle: (id: string) => void;
  onDraftChange: (id: string, value: string) => void;
  onSubmit: (id: string) => void;
  currentUserId?: string;
  teamMembers?: Array<{ id: string; name: string }>;
  onReact?: (commentId: string, emoji: string, hasReacted: boolean) => void;
};

function CommentPanel({
  ticketId, openCommentTicketId, commentLoadingTicketId, submittingCommentTicketId,
  ticketComments, commentDrafts, onToggle, onDraftChange, onSubmit,
  currentUserId, teamMembers = [], onReact,
}: CommentPanelProps) {
  const isOpen = openCommentTicketId === ticketId;
  const isLoading = commentLoadingTicketId === ticketId;
  const isSubmitting = submittingCommentTicketId === ticketId;
  const comments = ticketComments[ticketId] ?? [];
  const draft = commentDrafts[ticketId] ?? '';
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const handleDraftChange = (val: string) => {
    onDraftChange(ticketId, val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && atIdx === val.length - 1) {
      setMentionOpen(true);
      setMentionFilter('');
    } else if (atIdx >= 0 && val.slice(atIdx + 1).match(/^[\wÀ-ž\s]{0,20}$/)) {
      setMentionOpen(true);
      setMentionFilter(val.slice(atIdx + 1).toLowerCase());
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    const atIdx = draft.lastIndexOf('@');
    const newDraft = draft.slice(0, atIdx) + `@${name} `;
    onDraftChange(ticketId, newDraft);
    setMentionOpen(false);
  };

  const filteredMembers = teamMembers.filter((m) =>
    mentionFilter ? m.name.toLowerCase().includes(mentionFilter) : true,
  ).slice(0, 6);

  return (
    <div className="submissionBox">
      <button type="button" className="commentToggleBtn" onClick={() => onToggle(ticketId)}>
        {isOpen ? 'Yorumları Gizle' : `Yorumlar${ticketComments[ticketId] ? ` (${comments.length})` : ''}`}
      </button>
      {isOpen && (
        <div className="commentSection">
          {isLoading ? (
            <p className="muted">Yorumlar yükleniyor...</p>
          ) : (
            <>
              <div className="commentList">
                {comments.map((c) => {
                  const reactionMap: Record<string, Array<{ id: string; name: string }>> = {};
                  for (const r of c.reactions ?? []) {
                    if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
                    reactionMap[r.emoji].push(r.member);
                  }
                  return (
                    <div key={c.id} className="commentItem">
                      <div className="commentHeader">
                        <strong>{c.author.name}</strong>
                        <span className="muted">{new Date(c.createdAt).toLocaleString('tr-TR')}</span>
                      </div>
                      <p>{c.content}</p>
                      {onReact && (
                        <div className="reactionBar">
                          {Object.entries(reactionMap).map(([emoji, members]) => {
                            const hasReacted = members.some((m) => m.id === currentUserId);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                className={`reactionBtn${hasReacted ? ' reacted' : ''}`}
                                title={members.map((m) => m.name).join(', ')}
                                onClick={() => onReact(c.id, emoji, hasReacted)}
                              >
                                {emoji} <span>{members.length}</span>
                              </button>
                            );
                          })}
                          <div className="reactionPicker">
                            <button type="button" className="reactionAddBtn" title="Tepki ekle">+😀</button>
                            <div className="reactionPickerDropdown">
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => onReact(c.id, emoji, !!(reactionMap[emoji]?.some((m) => m.id === currentUserId)))}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="commentInput" style={{ position: 'relative' }}>
                <textarea
                  placeholder="Yorumunuzu yazın... (@isim ile mention yapabilirsiniz)"
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  rows={2}
                  disabled={isSubmitting}
                />
                {mentionOpen && filteredMembers.length > 0 && (
                  <div className="mentionDropdown">
                    {filteredMembers.map((m) => (
                      <button key={m.id} type="button" className="mentionItem" onClick={() => insertMention(m.name)}>
                        @{m.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { onSubmit(ticketId); setMentionOpen(false); }}
                  disabled={isSubmitting || !draft.trim()}
                >
                  {isSubmitting ? 'Gönderiliyor...' : 'Gönder'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
  RD_LEADER: 'AR-GE Lideri',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

const DEPARTMENT_LABELS: Record<Department, string> = {
  SOFTWARE: 'Yazilim',
  INDUSTRIAL: 'Endustri',
  MECHANICAL: 'Mekanik',
  ELECTRICAL_ELECTRONICS: 'Elektrik ve Elektronik',
};

const FALLBACK_QUOTES = [
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
  assignmentMode: 'MANUAL' | 'DEPARTMENT';
  targetDepartment: Department;
  departmentSelectionMode: 'ALL' | 'SELECTED';
  departmentMemberIds: string[];
  manualAssigneeIds: string[];
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
  if (draft.assignmentMode === 'MANUAL') {
    const manualAssigneeIds = normalizeAssigneeIds(draft.manualAssigneeIds);
    if (manualAssigneeIds.length < 1) {
      return 'En az 1 atanan secmelisin';
    }
    if (manualAssigneeIds.length !== draft.manualAssigneeIds.filter(Boolean).length) {
      return 'Ayni uye birden fazla kez atanamaz';
    }
  } else if (draft.departmentSelectionMode === 'SELECTED') {
    if (draft.departmentMemberIds.length < 1) {
      return 'Departmandan en az 1 uye secmelisin';
    }
  }
  return validateOptionalUploadFile(draft.attachmentFile);
}

function buildCreateTicketFormData(draft: TicketCreateDraft) {
  const form = new FormData();
  form.set('title', draft.title);
  form.set('description', draft.description);
  form.set('priority', draft.priority);
  form.set('dueAt', new Date(draft.dueAt).toISOString());
  form.set('assignmentMode', draft.assignmentMode);
  if (draft.assignmentMode === 'MANUAL') {
    normalizeAssigneeIds(draft.manualAssigneeIds).forEach((id) => form.append('assigneeIds', id));
  } else {
    form.set('targetDepartment', draft.targetDepartment);
    form.set('departmentSelectionMode', draft.departmentSelectionMode);
    if (draft.departmentSelectionMode === 'SELECTED') {
      draft.departmentMemberIds.forEach((id) => form.append('assigneeIds', id));
    }
  }
  if (draft.attachmentNote.trim()) {
    form.set('attachmentNote', draft.attachmentNote.trim());
  }
  if (draft.attachmentFile) {
    form.set('file', draft.attachmentFile);
  }
  return form;
}

const LOGIN_PARTICLES: Array<{
  w: number; h: number; top: string; left: string;
  bg: string; dur: string; delay: string;
}> = [
  { w: 7,  h: 7,  top: '9%',  left: '6%',  bg: 'rgba(35,164,255,0.55)',  dur: '9s',   delay: '0s'   },
  { w: 5,  h: 5,  top: '34%', left: '76%', bg: 'rgba(0,209,182,0.65)',   dur: '11s',  delay: '1.2s' },
  { w: 10, h: 10, top: '70%', left: '18%', bg: 'rgba(35,164,255,0.30)',  dur: '7.5s', delay: '0.6s' },
  { w: 6,  h: 6,  top: '55%', left: '89%', bg: 'rgba(0,209,182,0.50)',   dur: '13s',  delay: '2s'   },
  { w: 4,  h: 4,  top: '20%', left: '45%', bg: 'rgba(255,255,255,0.22)', dur: '8.5s', delay: '3s'   },
  { w: 8,  h: 8,  top: '81%', left: '60%', bg: 'rgba(35,164,255,0.40)',  dur: '10s',  delay: '0.3s' },
  { w: 5,  h: 5,  top: '91%', left: '35%', bg: 'rgba(0,209,182,0.35)',   dur: '14s',  delay: '1.8s' },
  { w: 9,  h: 9,  top: '46%', left: '3%',  bg: 'rgba(35,164,255,0.45)',  dur: '12s',  delay: '4s'   },
];

function pickNextQuote(previousQuote: string) {
  if (FALLBACK_QUOTES.length < 2) return FALLBACK_QUOTES[0] ?? previousQuote;
  let next = previousQuote;
  while (next === previousQuote) {
    next = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
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
  const [rememberMe, setRememberMe] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('jira_remember_me') === 'true',
  );

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('MEMBER');
  const [memberPrimaryDepartment, setMemberPrimaryDepartment] =
    useState<Department>('SOFTWARE');
  const [memberSecondaryDepartment, setMemberSecondaryDepartment] =
    useState<'' | Department>('');
  const [memberIsIntern, setMemberIsIntern] = useState(false);

  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('MEDIUM');
  const [ticketDueAt, setTicketDueAt] = useState('');
  const [ticketAssignmentMode, setTicketAssignmentMode] =
    useState<'MANUAL' | 'DEPARTMENT'>('MANUAL');
  const [ticketTargetDepartment, setTicketTargetDepartment] =
    useState<Department>('SOFTWARE');
  const [ticketDepartmentSelectionMode, setTicketDepartmentSelectionMode] =
    useState<'ALL' | 'SELECTED'>('ALL');
  const [ticketDepartmentMemberIds, setTicketDepartmentMemberIds] = useState<string[]>([]);
  const [ticketManualDepartmentFilter, setTicketManualDepartmentFilter] =
    useState<'ALL' | Department>('ALL');
  const [ticketManualAssigneeIds, setTicketManualAssigneeIds] = useState<string[]>(['', '']);
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
  const [meetingIncludeInterns, setMeetingIncludeInterns] = useState(true);
  const [meetingTargetMode, setMeetingTargetMode] = useState<MeetingTargetMode>('ALL');
  const [meetingSelectedDepartments, setMeetingSelectedDepartments] = useState<Department[]>([
    'SOFTWARE',
  ]);
  const [meetingFieldError, setMeetingFieldError] = useState('');
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [settingsFieldError, setSettingsFieldError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [taskLayout, setTaskLayout] = useState<'board' | 'list'>('board');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamRoleFilter, setTeamRoleFilter] = useState<'ALL' | TeamRole>('ALL');
  const [teamDepartmentFilter, setTeamDepartmentFilter] = useState<'ALL' | Department>('ALL');
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
  const [captainMemberDepartmentFilter, setCaptainMemberDepartmentFilter] =
    useState<'ALL' | Department>('ALL');
  const [captainMemberFocusId, setCaptainMemberFocusId] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reviewingTicketId, setReviewingTicketId] = useState<string | null>(null);
  const [memberTaskSearch, setMemberTaskSearch] = useState('');
  const [memberSubmissionSearch, setMemberSubmissionSearch] = useState('');
  const [boardAllTaskSearch, setBoardAllTaskSearch] = useState('');
  const [boardAllTaskStatusFilter, setBoardAllTaskStatusFilter] =
    useState<'ALL' | TicketStatus>('ALL');
  const [boardAllTaskDepartmentFilter, setBoardAllTaskDepartmentFilter] =
    useState<'ALL' | Department>('ALL');
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
  const [introQuote, setIntroQuote] = useState(FALLBACK_QUOTES[0]);
  const [quoteTypedChars, setQuoteTypedChars] = useState(0);
  const [introTypedChars, setIntroTypedChars] = useState(0);
  const [memberTasksPulse, setMemberTasksPulse] = useState(false);
  const [unseenAnnouncementCount, setUnseenAnnouncementCount] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('jira_theme') as 'dark' | 'light') ?? 'dark';
  });
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [bugReportText, setBugReportText] = useState('');
  const [isBugReportSending, setIsBugReportSending] = useState(false);
  const [bugReportError, setBugReportError] = useState('');
  const [deleteConfirmSubmission, setDeleteConfirmSubmission] = useState<Submission | null>(null);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);
  const [announcementFieldError, setAnnouncementFieldError] = useState('');
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveFieldError, setLeaveFieldError] = useState('');
  const [reviewingLeaveId, setReviewingLeaveId] = useState<string | null>(null);
  const [leaveReviewNote, setLeaveReviewNote] = useState('');
  const [previewSub, setPreviewSub] = useState<Submission | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ticketComments, setTicketComments] = useState<Record<string, Comment[]>>({});
  const [openCommentTicketId, setOpenCommentTicketId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoadingTicketId, setCommentLoadingTicketId] = useState<string | null>(null);
  const [submittingCommentTicketId, setSubmittingCommentTicketId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [ticketDependencyIds, setTicketDependencyIds] = useState<string[]>([]);
  const [ticketSaveAsTemplate, setTicketSaveAsTemplate] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTicketId, setMentionTicketId] = useState<string | null>(null);
  const loginRotateXRaw = useMotionValue(0);
  const loginRotateYRaw = useMotionValue(0);
  const loginRotateX = useSpring(loginRotateXRaw, { stiffness: 200, damping: 20 });
  const loginRotateY = useSpring(loginRotateYRaw, { stiffness: 200, damping: 20 });
  const toastIdRef = useRef(1);
  const previousUnseenTaskCountRef = useRef(0);
  const introQuoteRef = useRef(introQuote);
  const sseRef = useRef<EventSource | null>(null);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const memberTabRef = useRef<MemberTab>(memberTab);

  const currentUser = authBundle?.user ?? null;
  const isCaptain = currentUser?.role === 'CAPTAIN';
  const isMember = currentUser?.role === 'MEMBER' || currentUser?.role === 'RD_LEADER';
  const isBoard = currentUser?.role === 'BOARD';
  const systemProject = projects.find((p) => p.key === 'ULGEN-SYSTEM') ?? projects[0];
  const workspaceProjectCount = projects.filter(
    (project) => project.key !== 'ULGEN-SYSTEM',
  ).length;
  const activeTeamMembers = teamMembers.filter((member) => member.active);
  const currentUserIdentityLabel = useMemo(() => {
    if (!currentUser) return '';
    if (currentUser.role === 'CAPTAIN') return 'Kaptan';

    const detailed = activeTeamMembers.find((member) => member.id === currentUser.id);
    const departments =
      (detailed?.departments ?? [])
        .map((item) => DEPARTMENT_LABELS[item.department])
        .filter(Boolean) ?? [];
    const baseLabel = departments.length > 0 ? departments.join(', ') : 'Departman bilgisi yok';
    return detailed?.isIntern ? `${baseLabel} | Stajyer` : baseLabel;
  }, [currentUser, activeTeamMembers]);
  const memberDepartmentsById = useMemo(() => {
    const map = new Map<string, Department[]>();
    activeTeamMembers.forEach((member) => {
      map.set(
        member.id,
        (member.departments ?? []).map((item) => item.department),
      );
    });
    return map;
  }, [activeTeamMembers]);
  const filteredTeamMembers = activeTeamMembers.filter((m) => {
    const bySearch =
      m.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(teamSearch.toLowerCase());
    const byRole = teamRoleFilter === 'ALL' || m.role === teamRoleFilter;
    const byDepartment =
      teamDepartmentFilter === 'ALL' ||
      (m.departments ?? []).some((item) => item.department === teamDepartmentFilter);
    return bySearch && byRole && byDepartment;
  });
  const activeMembersInTargetDepartment = useMemo(
    () =>
      activeTeamMembers.filter((member) =>
        (member.departments ?? []).some((x) => x.department === ticketTargetDepartment),
      ),
    [activeTeamMembers, ticketTargetDepartment],
  );

  useEffect(() => {
    if (ticketAssignmentMode !== 'DEPARTMENT') {
      setTicketDepartmentMemberIds([]);
      return;
    }
    setTicketDepartmentMemberIds((prev) =>
      prev.filter((id) => activeMembersInTargetDepartment.some((member) => member.id === id)),
    );
  }, [ticketAssignmentMode, activeMembersInTargetDepartment]);

  const manualAssignableMembers = useMemo(
    () =>
      activeTeamMembers.filter(
        (member) =>
          ticketManualDepartmentFilter === 'ALL' ||
          (member.departments ?? []).some(
            (item) => item.department === ticketManualDepartmentFilter,
          ),
      ),
    [activeTeamMembers, ticketManualDepartmentFilter],
  );

  useEffect(() => {
    if (ticketAssignmentMode !== 'MANUAL') return;
    setTicketManualAssigneeIds((prev) => {
      const allowed = new Set(manualAssignableMembers.map((member) => member.id));
      const next = prev.map((id) => (id && !allowed.has(id) ? '' : id));
      return next.length < 2 ? [...next, ...Array.from({ length: 2 - next.length }, () => '')] : next;
    });
  }, [
    ticketAssignmentMode,
    manualAssignableMembers,
  ]);

  const canAddManualAssigneeField = useMemo(() => {
    if (ticketManualAssigneeIds.length < 2) return false;
    return ticketManualAssigneeIds.every((id) => Boolean(id));
  }, [ticketManualAssigneeIds]);

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

  const boardAllTickets = useMemo(() => {
    const q = boardAllTaskSearch.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const byStatus =
        boardAllTaskStatusFilter === 'ALL' || ticket.status === boardAllTaskStatusFilter;
      const byDepartment =
        boardAllTaskDepartmentFilter === 'ALL' ||
        ticket.assignees.some((assignment) =>
          (memberDepartmentsById.get(assignment.member.id) ?? []).includes(
            boardAllTaskDepartmentFilter,
          ),
        );
      if (!byStatus) return false;
      if (!byDepartment) return false;
      if (!q) return true;
      return (
        ticket.title.toLowerCase().includes(q) ||
        (ticket.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    tickets,
    boardAllTaskSearch,
    boardAllTaskStatusFilter,
    boardAllTaskDepartmentFilter,
    memberDepartmentsById,
  ]);

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

  const departmentOverviewStats = useMemo(() => {
    const nowMs = Date.now();
    return (Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => {
      const memberIds = new Set(
        activeTeamMembers
          .filter((member) =>
            (member.departments ?? []).some((item) => item.department === department),
          )
          .map((member) => member.id),
      );
      const relatedTickets = tickets.filter((ticket) =>
        ticket.assignees.some((assignment) => memberIds.has(assignment.member.id)),
      );
      const openCount = relatedTickets.filter((ticket) => ticket.status !== 'DONE').length;
      const lateCount = relatedTickets.filter((ticket) => {
        if (ticket.status === 'DONE' || !ticket.dueAt) return false;
        const dueMs = new Date(ticket.dueAt).getTime();
        return Number.isFinite(dueMs) && dueMs < nowMs;
      }).length;
      const criticalCount = relatedTickets.filter(
        (ticket) => ticket.status !== 'DONE' && ticket.priority === 'CRITICAL',
      ).length;
      return {
        department,
        memberCount: memberIds.size,
        openCount,
        lateCount,
        criticalCount,
      };
    });
  }, [activeTeamMembers, tickets]);

  const captainMemberStats = useMemo(() => {
    const nowMs = Date.now();
    return activeTeamMembers
      .filter((m) => m.role === 'MEMBER' || m.role === 'RD_LEADER')
      .map((member) => {
        const memberTickets = tickets.filter((t) =>
          t.assignees.some((a) => a.member.id === member.id),
        );
        let doneCount = 0, activeCount = 0, lateCount = 0;
        let doneTimeSum = 0, doneTimeCount = 0;
        for (const t of memberTickets) {
          const isDone = t.status === 'DONE';
          if (isDone) {
            doneCount++;
            if (t.completedAt && t.createdAt) {
              doneTimeSum += (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 86_400_000;
              doneTimeCount++;
            }
          } else {
            activeCount++;
          }
          if (t.dueAt) {
            const dueMs = new Date(t.dueAt).getTime();
            const isLate = isDone && t.completedAt
              ? new Date(t.completedAt).getTime() > dueMs
              : dueMs < nowMs;
            if (isLate) lateCount++;
          }
        }
        const avgDays = doneTimeCount > 0 ? doneTimeSum / doneTimeCount : null;
        return { member, total: memberTickets.length, done: doneCount, active: activeCount, late: lateCount, avgDays };
      })
      .sort((a, b) => b.total - a.total);
  }, [activeTeamMembers, tickets]);

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

  const captainMemberPages = useMemo(() => {
    if (captainMemberDepartmentFilter === 'ALL') return activeTeamMembers;
    return activeTeamMembers.filter((member) =>
      (member.departments ?? []).some(
        (item) => item.department === captainMemberDepartmentFilter,
      ),
    );
  }, [activeTeamMembers, captainMemberDepartmentFilter]);

  const captainDepartmentOptions = useMemo(() => {
    return (Object.keys(DEPARTMENT_LABELS) as Department[]).filter((department) =>
      activeTeamMembers.some((member) =>
        (member.departments ?? []).some((item) => item.department === department),
      ),
    );
  }, [activeTeamMembers]);

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

  useEffect(() => {
    if (!authBundle) {
      sseRef.current?.close();
      sseRef.current = null;
      return;
    }

    let cancelled = false;

    const connectSse = async () => {
      try {
        const ticketRes = await fetch(`${API_URL}/events/ticket`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authBundle.accessToken}` },
        });
        if (!ticketRes.ok || cancelled) return;
        const { ticket } = (await ticketRes.json()) as { ticket: string };
        if (cancelled) return;

        sseRef.current?.close();
        const es = new EventSource(
          `${API_URL}/events/stream?ticket=${encodeURIComponent(ticket)}`,
        );
        sseRef.current = es;
        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data as string) as {
              type: string;
              ticketTitle?: string;
              action?: string;
              note?: string;
              authorName?: string;
              title?: string;
            };
            if (payload.type === 'ping') return;
            if (payload.type === 'ticket:reviewed') {
              const label = payload.action === 'APPROVED' ? 'Onaylandi' : 'Reddedildi';
              showToast(
                payload.action === 'APPROVED' ? 'success' : 'error',
                `"${payload.ticketTitle}" ${label}${payload.note ? `: ${payload.note}` : ''}`,
              );
            } else if (payload.type === 'comment:new') {
              showToast('success', `${payload.authorName} "${payload.ticketTitle}" gorevine yorum yapti`);
            } else if (payload.type === 'announcement:new') {
              showToast('success', `Yeni duyuru: ${payload.title}`);
              if (memberTabRef.current !== 'announcements') {
                setUnseenAnnouncementCount((c) => c + 1);
              }
            } else if (payload.type === 'ticket:deadline') {
              showToast('error', `Son 24 saat! "${payload.ticketTitle}" teslim tarihi yaklasiyor.`);
            }
          } catch {
            // malformed event — ignore
          }
        };
        es.onerror = () => {
          // browser auto-reconnects; no action needed
        };
      } catch {
        // ticket fetch failed — SSE will not connect
      }
    };

    void connectSse();

    return () => {
      cancelled = true;
      sseRef.current?.close();
      sseRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authBundle?.accessToken]);

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
        body: JSON.stringify({ rememberMe: localStorage.getItem('jira_remember_me') === 'true' }),
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
      ...(init?.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
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

  async function fetchRandomIntroQuote(previousQuote: string) {
    try {
      const res = await fetch(`${API_URL}/quotes/random`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      const data = (await res.json()) as QuoteApiResponse;
      const nextQuote = data.quote?.text?.trim();
      if (!nextQuote) return pickNextQuote(previousQuote);
      return nextQuote;
    } catch {
      return pickNextQuote(previousQuote);
    }
  }

  async function rotateIntroQuote() {
    const nextQuote = await fetchRandomIntroQuote(introQuoteRef.current);
    introQuoteRef.current = nextQuote;
    setIntroQuote(nextQuote);
  }

  async function loadAuditLogs(page: number) {
    setAuditLoading(true);
    try {
      const data = await apiFetch(`/audit-logs?page=${page}&pageSize=20`);
      setAuditLogs(data.logs as AuditLogEntry[]);
      setAuditTotal(data.total as number);
      setAuditPage(page);
    } catch {
      /* silent */
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadAll() {
    if (!currentUser) return;
    const isCaptainUser = currentUser.role === 'CAPTAIN';
    const [projectData, memberData, ticketData, meetingData, announcementData, leaveData, templateData] = await Promise.all([
      apiFetch('/projects'),
      apiFetch('/team-members'),
      apiFetch('/tickets'),
      apiFetch('/meetings/current'),
      apiFetch('/announcements'),
      isCaptainUser ? apiFetch('/leaves') : apiFetch('/leaves/mine'),
      apiFetch('/templates'),
    ]);
    setTemplates(templateData as TicketTemplate[]);
    setProjects(projectData);
    setTeamMembers(memberData);
    setTickets(ticketData);
    setAnnouncements(announcementData as Announcement[]);
    if (isCaptainUser) {
      setLeaves(leaveData as Leave[]);
    } else {
      setMyLeaves(leaveData as Leave[]);
    }
    const nextMeeting = (meetingData as { meeting?: MeetingInfo | null }).meeting ?? null;
    setMeeting(nextMeeting);
    setMeetingScheduledAt(nextMeeting ? toDatetimeLocalValue(nextMeeting.scheduledAt) : '');
    setMeetingUrl(nextMeeting?.meetingUrl ?? '');
    setMeetingNote(nextMeeting?.note ?? '');
    setMeetingIncludeInterns(nextMeeting?.includeInterns ?? true);
    setMeetingTargetMode(nextMeeting?.targetMode ?? 'ALL');
    setMeetingSelectedDepartments(
      nextMeeting?.targetDepartments && nextMeeting.targetDepartments.length > 0
        ? nextMeeting.targetDepartments
        : ['SOFTWARE'],
    );
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
          teamDepartmentFilter?: 'ALL' | Department;
        taskStatusFilter?: 'ALL' | TicketStatus;
        taskPriorityFilter?: 'ALL' | TicketPriority;
        boardAllTaskDepartmentFilter?: 'ALL' | Department;
        captainMemberDepartmentFilter?: 'ALL' | Department;
      };
        if (parsed.captainTab) setCaptainTab(parsed.captainTab);
        if (parsed.memberTab) setMemberTab(parsed.memberTab);
        if (parsed.taskLayout) setTaskLayout(parsed.taskLayout);
        if (parsed.teamRoleFilter) setTeamRoleFilter(parsed.teamRoleFilter);
        if (parsed.teamDepartmentFilter) {
          setTeamDepartmentFilter(parsed.teamDepartmentFilter);
        }
        if (parsed.taskStatusFilter) setTaskStatusFilter(parsed.taskStatusFilter);
        if (parsed.taskPriorityFilter) setTaskPriorityFilter(parsed.taskPriorityFilter);
        if (parsed.boardAllTaskDepartmentFilter) {
          setBoardAllTaskDepartmentFilter(parsed.boardAllTaskDepartmentFilter);
        }
        if (parsed.captainMemberDepartmentFilter) {
          setCaptainMemberDepartmentFilter(parsed.captainMemberDepartmentFilter);
        }
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
      setTeamDepartmentFilter('ALL');
      setCaptainTab('home');
      return;
    }
    if (currentUser.role === 'BOARD') {
      setMemberTab('home');
      setBoardAllTaskDepartmentFilter('ALL');
    }
    if (currentUser.role === 'MEMBER' || currentUser.role === 'RD_LEADER') {
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
    memberTabRef.current = memberTab;
  }, [memberTab]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
    localStorage.setItem('jira_theme', theme);
  }, [theme]);

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
        teamDepartmentFilter,
        taskStatusFilter,
        taskPriorityFilter,
        boardAllTaskDepartmentFilter,
        captainMemberDepartmentFilter,
      }),
    );
  }, [
    captainTab,
    memberTab,
    taskLayout,
    teamRoleFilter,
    teamDepartmentFilter,
    taskStatusFilter,
    taskPriorityFilter,
    boardAllTaskDepartmentFilter,
    captainMemberDepartmentFilter,
  ]);

  useEffect(() => {
    introQuoteRef.current = introQuote;
  }, [introQuote]);

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
      void rotateIntroQuote();
    }, QUOTE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [introStage]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
      document.documentElement.style.setProperty('--my', `${e.clientY}px`);
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    if (introStage !== 'quote') return;
    setQuoteTypedChars(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 3, introQuote.length);
      setQuoteTypedChars(i);
      if (i >= introQuote.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [introQuote, introStage]);

  function handleLoginMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientY - rect.top) / rect.height - 0.5;
    const y = (e.clientX - rect.left) / rect.width - 0.5;
    loginRotateXRaw.set(-x * 8);
    loginRotateYRaw.set(y * 8);
  }

  function handleLoginMouseLeave() {
    loginRotateXRaw.set(0);
    loginRotateYRaw.set(0);
  }

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
        body: JSON.stringify({ email, password, rememberMe }),
      });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      const bundle = (await res.json()) as AuthBundle;
      localStorage.setItem('jira_auth', JSON.stringify(bundle));
      localStorage.setItem('jira_remember_me', String(rememberMe));
      setLoading(true);
      setAuthBundle(bundle);
      setIntroStage('terminal');
      void rotateIntroQuote();
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
    localStorage.removeItem('jira_remember_me');
    setAuthBundle(null);
    setProjects([]);
    setTickets([]);
    setTeamMembers([]);
    setCaptainTab('home');
    setMemberTab('home');
    setIntroStage('none');
    showToast('success', 'Oturum kapatildi');
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!authBundle) return;
    if (isChangingPassword) return;
    setSettingsFieldError('');

    if (currentPassword.length < 4) {
      setSettingsFieldError('Mevcut sifre en az 4 karakter olmali.');
      return;
    }
    if (newPassword.length < 6) {
      setSettingsFieldError('Yeni sifre en az 6 karakter olmali.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setSettingsFieldError('Yeni sifre ve tekrar sifresi ayni olmali.');
      return;
    }

    try {
      setIsChangingPassword(true);
      await apiFetch('/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await logout();
      showToast('success', 'Sifre degistirildi. Guvenlik nedeniyle tekrar giris yapin.');
    } catch (error) {
      setSettingsFieldError(
        error instanceof Error ? error.message : 'Sifre degistirilemedi.',
      );
    } finally {
      setIsChangingPassword(false);
    }
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
      showToast('success', 'Hata raporunuz başarılı bir şekilde gönderildi.');
    } catch (error) {
      const message =
        error instanceof TypeError ? NETWORK_ERROR_MESSAGE : (error as Error).message;
      setBugReportError(message);
    } finally {
      setIsBugReportSending(false);
    }
  }

  async function createAnnouncement(e: FormEvent) {
    e.preventDefault();
    if (isSubmittingAnnouncement) return;
    const title = announcementTitle.trim();
    const content = announcementContent.trim();
    if (!title) { setAnnouncementFieldError('Baslik zorunludur'); return; }
    if (!content) { setAnnouncementFieldError('Icerik zorunludur'); return; }
    try {
      setIsSubmittingAnnouncement(true);
      setAnnouncementFieldError('');
      const result = await apiFetch('/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) });
      setAnnouncements((prev) => [result as Announcement, ...prev]);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      showToast('success', 'Duyuru olusturuldu.');
    } catch (error) {
      setAnnouncementFieldError(error instanceof Error ? error.message : 'Duyuru olusturulamadi.');
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  }

  async function deleteAnnouncement(id: string) {
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      showToast('success', 'Duyuru silindi.');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Duyuru silinemedi.');
    }
  }

  async function createLeave(e: FormEvent) {
    e.preventDefault();
    if (isSubmittingLeave) return;
    if (!leaveStartDate) { setLeaveFieldError('Baslangic tarihi zorunludur'); return; }
    if (!leaveEndDate) { setLeaveFieldError('Bitis tarihi zorunludur'); return; }
    if (new Date(leaveEndDate) < new Date(leaveStartDate)) {
      setLeaveFieldError('Bitis tarihi baslangic tarihinden once olamaz');
      return;
    }
    if (!leaveReason.trim()) { setLeaveFieldError('Sebep zorunludur'); return; }
    try {
      setIsSubmittingLeave(true);
      setLeaveFieldError('');
      const result = await apiFetch('/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: leaveStartDate, endDate: leaveEndDate, reason: leaveReason.trim() }),
      });
      setMyLeaves((prev) => [result as Leave, ...prev]);
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReason('');
      showToast('success', 'Izin talebiniz gonderildi.');
    } catch (error) {
      setLeaveFieldError(error instanceof Error ? error.message : 'Izin talebi gonderilemedi.');
    } finally {
      setIsSubmittingLeave(false);
    }
  }

  async function reviewLeave(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      const result = await apiFetch(`/leaves/${id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNote: leaveReviewNote.trim() || undefined }),
      });
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...(result as Leave) } : l)),
      );
      setReviewingLeaveId(null);
      setLeaveReviewNote('');
      showToast('success', status === 'APPROVED' ? 'Izin onaylandi.' : 'Izin reddedildi.');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Islem basarisiz.');
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
    if (meetingTargetMode === 'SELECTED' && meetingSelectedDepartments.length < 1) {
      setMeetingFieldError('Secili departman modunda en az bir departman secmelisiniz.');
      return;
    }

    setIsSavingMeeting(true);
    try {
      const isUpdating = Boolean(meeting?.id);
      const result = (await apiFetch(isUpdating ? '/meetings/current' : '/meetings', {
        method: isUpdating ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: scheduled.toISOString(),
          meetingUrl: trimmedUrl,
          note: meetingNote.trim() || undefined,
          includeInterns: meetingIncludeInterns,
          targetMode: meetingTargetMode,
          targetDepartments:
            meetingTargetMode === 'SELECTED'
              ? Array.from(new Set(meetingSelectedDepartments))
              : undefined,
        }),
      })) as { meeting: MeetingInfo };
      setMeeting(result.meeting);
      setMeetingScheduledAt(toDatetimeLocalValue(result.meeting.scheduledAt));
      setMeetingUrl(result.meeting.meetingUrl);
      setMeetingNote(result.meeting.note ?? '');
      setMeetingIncludeInterns(result.meeting.includeInterns ?? true);
      setMeetingTargetMode(result.meeting.targetMode ?? 'ALL');
      setMeetingSelectedDepartments(
        result.meeting.targetDepartments && result.meeting.targetDepartments.length > 0
          ? result.meeting.targetDepartments
          : ['SOFTWARE'],
      );
      showToast('success', isUpdating ? 'Toplanti guncellendi.' : 'Toplanti planlandi.');
    } catch (error) {
      setMeetingFieldError(error instanceof Error ? error.message : 'Toplanti planlanamadi.');
    } finally {
      setIsSavingMeeting(false);
    }
  }

  async function cancelMeetingPlan() {
    if (!isCaptain || !meeting) return;
    if (isSavingMeeting) return;
    setMeetingFieldError('');
    try {
      setIsSavingMeeting(true);
      await apiFetch('/meetings/current', { method: 'DELETE' });
      setMeeting(null);
      setMeetingScheduledAt('');
      setMeetingUrl('');
      setMeetingNote('');
      setMeetingIncludeInterns(true);
      setMeetingTargetMode('ALL');
      setMeetingSelectedDepartments(['SOFTWARE']);
      showToast('success', 'Toplanti iptal edildi.');
    } catch (error) {
      setMeetingFieldError(error instanceof Error ? error.message : 'Toplanti iptal edilemedi.');
    } finally {
      setIsSavingMeeting(false);
    }
  }

  function adjustMeetingMinutes(delta: number) {
    const base = meetingScheduledAt ? new Date(meetingScheduledAt) : new Date();
    if (Number.isNaN(base.getTime())) return;
    base.setSeconds(0, 0);
    base.setMinutes(base.getMinutes() + delta);
    setMeetingScheduledAt(toDatetimeLocalValue(base.toISOString()));
    setMeetingFieldError('');
  }

  const canAddMeetingDepartment = useMemo(
    () => meetingSelectedDepartments.length < (Object.keys(DEPARTMENT_LABELS) as Department[]).length,
    [meetingSelectedDepartments],
  );

  function addMeetingDepartmentField() {
    if (!canAddMeetingDepartment) return;
    const all = Object.keys(DEPARTMENT_LABELS) as Department[];
    const existing = new Set(meetingSelectedDepartments);
    const next = all.find((department) => !existing.has(department));
    if (!next) return;
    setMeetingSelectedDepartments((prev) => [...prev, next]);
    setMeetingFieldError('');
  }

  function removeMeetingDepartmentField(index: number) {
    setMeetingSelectedDepartments((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setMeetingFieldError('');
  }

  function setMeetingDepartmentAt(index: number, department: Department) {
    setMeetingSelectedDepartments((prev) =>
      prev.map((value, idx) => (idx === index ? department : value)),
    );
    setMeetingFieldError('');
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
    if (
      memberSecondaryDepartment &&
      memberSecondaryDepartment === memberPrimaryDepartment
    ) {
      setMemberFieldError('Ikinci departman birinci departmanla ayni olamaz');
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
          primaryDepartment: memberPrimaryDepartment,
          secondaryDepartment: memberSecondaryDepartment || undefined,
          isIntern: memberIsIntern,
        }),
      });
      setMemberName('');
      setMemberEmail('');
      setMemberPassword('');
      setMemberRole('MEMBER');
      setMemberPrimaryDepartment('SOFTWARE');
      setMemberSecondaryDepartment('');
      setMemberIsIntern(false);
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
  async function promoteInternToMember(id: string) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/team-members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isIntern: false,
          role: 'MEMBER',
        }),
      });
      await loadAll();
      showToast('success', 'Stajyer takim uyeligine yukseltilmistir');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function promoteMemberToBoard(id: string) {
    if (!isCaptain) return;
    setError('');
    try {
      await apiFetch(`/team-members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'BOARD',
        }),
      });
      await loadAll();
      showToast('success', 'Uye yonetim kuruluna yukseltilmistir');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function setManualAssigneeAt(index: number, memberId: string) {
    setTicketManualAssigneeIds((prev) =>
      prev.map((value, idx) => (idx === index ? memberId : value)),
    );
  }

  function addManualAssigneeField() {
    if (!canAddManualAssigneeField) return;
    setTicketManualAssigneeIds((prev) => [...prev, '']);
  }

  function removeManualAssigneeField(index: number) {
    setTicketManualAssigneeIds((prev) => {
      if (index < 2 || prev.length <= 2) return prev;
      const next = prev.filter((_, idx) => idx !== index);
      return next.length < 2
        ? [...next, ...Array.from({ length: 2 - next.length }, () => '')]
        : next;
    });
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
      assignmentMode: ticketAssignmentMode,
      targetDepartment: ticketTargetDepartment,
      departmentSelectionMode: ticketDepartmentSelectionMode,
      departmentMemberIds: ticketDepartmentMemberIds,
      manualAssigneeIds: ticketManualAssigneeIds,
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
      const created = await apiFetch('/tickets', {
        method: 'POST',
        body: buildCreateTicketFormData(draft),
      }) as { id: string } | undefined;

      if (created?.id && ticketDependencyIds.length > 0) {
        await Promise.allSettled(
          ticketDependencyIds.map((depId) =>
            apiFetch(`/tickets/${created.id}/dependencies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dependsOnId: depId }),
            }),
          ),
        );
      }

      if (ticketSaveAsTemplate && ticketTitle.trim()) {
        void apiFetch('/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: ticketTitle.trim(), description: ticketDesc || undefined, priority: ticketPriority }),
        });
      }

      setTicketTitle('');
      setTicketDesc('');
      setTicketPriority('MEDIUM');
      setTicketDueAt('');
      setTicketAssignmentMode('MANUAL');
      setTicketTargetDepartment('SOFTWARE');
      setTicketDepartmentSelectionMode('ALL');
      setTicketDepartmentMemberIds([]);
      setTicketManualAssigneeIds(['', '']);
      setTicketAttachmentFile(null);
      setTicketAttachmentNote('');
      setTicketDependencyIds([]);
      setSelectedTemplateId('');
      setTicketSaveAsTemplate(false);
      await loadAll();
      showToast('success', 'Gorev olusturuldu');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreatingTicket(false);
    }
  }

  function focusDepartmentInTasks(department: Department) {
    setCaptainTab('tasks');
    setTicketAssignmentMode('DEPARTMENT');
    setTicketTargetDepartment(department);
    setTicketDepartmentSelectionMode('ALL');
    setTicketDepartmentMemberIds([]);
    setTicketManualDepartmentFilter(department);
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

  async function openFilePreview(submission: Submission) {
    if (!authBundle) return;
    setPreviewSub(submission);
    setPreviewBlobUrl(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/tickets/submissions/${submission.id}/download`,
        { headers: { Authorization: `Bearer ${authBundle.accessToken}` } },
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = submission.fileName.toLowerCase();
      if (name.endsWith('.docx') || name.endsWith('.doc')) {
        const { renderAsync } = await import('docx-preview');
        setPreviewBlobUrl('docx');
        setPreviewLoading(false);
        // wait for the container ref to mount
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '';
          await renderAsync(blob, docxContainerRef.current, undefined, {
            className: 'docx-preview',
            inWrapper: false,
          } as DocxPreviewOptions);
        }
      } else {
        setPreviewBlobUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      showToast('error', (e as Error).message);
      setPreviewSub(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeFilePreview() {
    if (previewBlobUrl && previewBlobUrl !== 'docx') URL.revokeObjectURL(previewBlobUrl);
    if (docxContainerRef.current) docxContainerRef.current.innerHTML = '';
    setPreviewBlobUrl(null);
    setPreviewSub(null);
  }

  function deleteSubmission(submission: Submission) {
    setDeleteConfirmSubmission(submission);
  }

  async function confirmDeleteSubmission() {
    if (!deleteConfirmSubmission) return;
    setIsDeletingSubmission(true);
    try {
      await apiFetch(`/tickets/submissions/${deleteConfirmSubmission.id}`, { method: 'DELETE' });
      setTickets((prev) =>
        prev.map((t) => ({
          ...t,
          submissions: t.submissions.filter((s) => s.id !== deleteConfirmSubmission.id),
        })),
      );
      setDeleteConfirmSubmission(null);
      showToast('success', 'Teslim silindi.');
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setIsDeletingSubmission(false);
    }
  }

  async function loadComments(ticketId: string) {
    setCommentLoadingTicketId(ticketId);
    try {
      const data = await apiFetch(`/tickets/${ticketId}/comments`);
      setTicketComments((prev) => ({ ...prev, [ticketId]: data }));
    } catch {
      // silent — user sees empty state
    } finally {
      setCommentLoadingTicketId(null);
    }
  }

  async function toggleComments(ticketId: string) {
    if (openCommentTicketId === ticketId) {
      setOpenCommentTicketId(null);
      return;
    }
    setOpenCommentTicketId(ticketId);
    if (!ticketComments[ticketId]) {
      await loadComments(ticketId);
    }
  }

  async function submitComment(ticketId: string) {
    const content = (commentDrafts[ticketId] ?? '').trim();
    if (!content || submittingCommentTicketId) return;
    setSubmittingCommentTicketId(ticketId);
    try {
      const newComment = await apiFetch(`/tickets/${ticketId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setTicketComments((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] ?? []), newComment],
      }));
      setCommentDrafts((prev) => ({ ...prev, [ticketId]: '' }));
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSubmittingCommentTicketId(null);
    }
  }

  async function handleReaction(commentId: string, emoji: string, hasReacted: boolean) {
    const ticketId = Object.keys(ticketComments).find((tid) =>
      ticketComments[tid]?.some((c) => c.id === commentId),
    );
    if (!ticketId) return;
    try {
      if (hasReacted) {
        await apiFetch(`/tickets/${ticketId}/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/tickets/${ticketId}/comments/${commentId}/reactions`, {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        });
      }
      const updated = await apiFetch(`/tickets/${ticketId}/comments`);
      setTicketComments((prev) => ({ ...prev, [ticketId]: updated }));
    } catch (e) {
      showToast('error', (e as Error).message);
    }
  }

  if (!currentUser) {
    return (
      <main className="loginScreen">
        {LOGIN_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="loginParticle"
            style={{
              width: p.w,
              height: p.h,
              top: p.top,
              left: p.left,
              background: p.bg,
              animationDuration: p.dur,
              animationDelay: p.delay,
            }}
          />
        ))}

        <motion.div
          className="loginFormCol"
          style={{ rotateX: loginRotateX, rotateY: loginRotateY }}
          onMouseMove={handleLoginMouseMove}
          onMouseLeave={handleLoginMouseLeave}
        >
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            Ülgen AR-GE Giriş
          </motion.h1>
          <motion.p
            className="muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
          >
            Üyeler e-posta ve şifre ile giriş yapar.
          </motion.p>
          {error && <p className="errorBox">{error}</p>}
          <form onSubmit={onLogin} className="formBlock">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.3 }}
            >
              <input
                placeholder="E-posta"
                value={loginEmail}
                onChange={(e) => {
                  setLoginEmail(e.target.value);
                  setLoginFieldError('');
                }}
                required
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.19, duration: 0.3 }}
            >
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
            </motion.div>
            {loginFieldError && <p className="fieldError">{loginFieldError}</p>}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.3 }}
            >
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Beni Hatırla
              </label>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.33, duration: 0.3 }}
            >
              <motion.button
                type="submit"
                disabled={isLoggingIn}
                whileHover={{ scale: 1.02, boxShadow: '0 8px 28px rgba(35,164,255,0.35)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                style={{ width: '100%' }}
              >
                {isLoggingIn ? 'Giris yapiliyor...' : 'Giris Yap'}
              </motion.button>
            </motion.div>
          </form>
          <Link href="/forgot-password" className="textBtn inlineLink">
            Sifremi unuttum
          </Link>
        </motion.div>

        <motion.div
          className="loginBrandCol"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="loginBrandOrbA" aria-hidden="true" />
          <div className="loginBrandOrbB" aria-hidden="true" />
          <p className="loginBrandLogo">ÜLGEN</p>
          <p className="loginBrandSub">AR-GE Proje Yönetim Sistemi</p>
          <span className="loginStatusBadge">
            <span className="loginStatusDot" />
            Sistem Çevrimiçi
          </span>
          <blockquote className="loginBrandQuote">
            Yükselmek cesaret ister, havada kalmak disiplin.
          </blockquote>
        </motion.div>

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
              <div className="introScore" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <ScoreRing score={introScore.score} tone={introScore.tone} />
                <div>
                  <p className="introScoreValue" style={{ marginBottom: 6 }}>{`Günlük Odak Puanı: ${introScore.score}/100`}</p>
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
              </div>
              <div className="terminalBox">
                <div className="terminalWinBar">
                  <span className="winDot winRed" />
                  <span className="winDot winYellow" />
                  <span className="winDot winGreen" />
                  <span className="terminalWinTitle">ulgen://daily-brief</span>
                </div>
                {introTerminalLines.map((line, index) => {
                  const typedLine = getTypedIntroLine(index);
                  if (!typedLine) return null;
                  const range = introLineRanges[index];
                  const isTyping =
                    introTypedChars < introTotalChars &&
                    introTypedChars > range.start &&
                    introTypedChars <= range.end;
                  return (
                    <motion.p
                      key={`${line}-${index}`}
                      className={isTyping ? 'terminalLine isTyping' : 'terminalLine'}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: index * 0.04 }}
                    >
                      {typedLine}
                    </motion.p>
                  );
                })}
              </div>
              <motion.button
                type="button"
                className="introActionBtn"
                whileHover={{ scale: 1.03, boxShadow: '0 8px 28px rgba(35,164,255,0.35)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={() => {
                  setIntroStage('quote');
                  void rotateIntroQuote();
                }}
              >
                Girişe Devam Et
              </motion.button>
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
              <div className="quoteOrb quoteOrb1" aria-hidden="true" />
              <div className="quoteOrb quoteOrb2" aria-hidden="true" />
              <div className="quoteHeader">
                <span className="quoteMark">{'"'}</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={introQuote}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22 }}
                >
                  {introQuote.slice(0, quoteTypedChars)}
                  {quoteTypedChars < introQuote.length && (
                    <span className="quoteCursor">|</span>
                  )}
                </motion.blockquote>
              </AnimatePresence>
              <div className="quoteSkipRow">
                <button
                  type="button"
                  className="quoteSkip"
                  onClick={() => void rotateIntroQuote()}
                >
                  Sonraki Alıntı →
                </button>
              </div>
              <motion.button
                type="button"
                className="introActionBtn introLightBtn"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={() => setIntroStage('none')}
              >
                Çalışma Alanına Geç
              </motion.button>
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
            {currentUser.name} ({currentUserIdentityLabel}) ile aktif oturum.
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
        <button
          type="button"
          className="themeToggleBtn"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label="Tema değiştir"
        >
          {theme === 'dark' ? '☀ Açık Mod' : '☾ Koyu Mod'}
        </button>
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
                <button type="button" className={captainTab === 'kanban' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('kanban')}><span>Kanban</span>{captainTab === 'kanban' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'calendar' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('calendar')}><span>Takvim</span>{captainTab === 'calendar' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'audit' ? 'tabBtn active' : 'tabBtn'} onClick={() => { setCaptainTab('audit'); loadAuditLogs(1); }}><span>Aktivite</span>{captainTab === 'audit' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'submissions' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('submissions')}><span>Kisi Sayfalari</span>{captainTab === 'submissions' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'announcements' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('announcements')}><span>Duyurular</span>{captainTab === 'announcements' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'leaves' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('leaves')}><span>Izin Talepleri</span>{captainTab === 'leaves' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={captainTab === 'settings' ? 'tabBtn active' : 'tabBtn'} onClick={() => setCaptainTab('settings')}><span>Ayarlar</span>{captainTab === 'settings' && <motion.i className="tabIndicator" layoutId="captainTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
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
                <button type="button" className={memberTab === 'calendar' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('calendar')}><span>Takvim</span>{memberTab === 'calendar' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button
                  type="button"
                  className={memberTab === 'announcements' ? 'tabBtn active' : 'tabBtn'}
                  onClick={() => { setMemberTab('announcements'); setUnseenAnnouncementCount(0); }}
                >
                  <span>Duyurular</span>
                  {unseenAnnouncementCount > 0 && (
                    <b className="tabCountBadge hot">{unseenAnnouncementCount}</b>
                  )}
                  {memberTab === 'announcements' && (
                    <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />
                  )}
                </button>
                <button type="button" className={memberTab === 'my_leaves' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('my_leaves')}><span>Izin Taleplerim</span>{memberTab === 'my_leaves' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                <button type="button" className={memberTab === 'settings' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('settings')}><span>Ayarlar</span>{memberTab === 'settings' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                {isBoard && (
                  <button type="button" className={memberTab === 'all_tasks' ? 'tabBtn active' : 'tabBtn'} onClick={() => setMemberTab('all_tasks')}><span>Tum Gorevler</span>{memberTab === 'all_tasks' && <motion.i className="tabIndicator" layoutId="memberTabIndicator" transition={{ type: 'spring', stiffness: 320, damping: 26 }} />}</button>
                )}
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
                <h3>{meeting ? 'Toplantiyi Guncelle' : 'Toplanti Planla'}</h3>
                <input
                  type="datetime-local"
                  value={meetingScheduledAt}
                  step={60}
                  onChange={(e) => {
                    setMeetingScheduledAt(e.target.value);
                    setMeetingFieldError('');
                  }}
                  onWheel={(e) => {
                    e.currentTarget.blur();
                  }}
                  required
                />
                <div className="submissionBox">
                  <button type="button" onClick={() => adjustMeetingMinutes(-1)}>
                    -1 dk
                  </button>
                  <button type="button" onClick={() => adjustMeetingMinutes(1)}>
                    +1 dk
                  </button>
                </div>
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
                <select
                  value={meetingTargetMode}
                  onChange={(e) => {
                    setMeetingTargetMode(e.target.value as MeetingTargetMode);
                    setMeetingFieldError('');
                  }}
                >
                  <option value="ALL">Tum Departmanlar</option>
                  <option value="SELECTED">Secili Departmanlar</option>
                </select>
                {meetingTargetMode === 'SELECTED' && (
                  <div className="submissionBox">
                    {meetingSelectedDepartments.map((department, index) => {
                      const selectedByOthers = new Set(
                        meetingSelectedDepartments.filter((x, idx) => idx !== index),
                      );
                      const options = (Object.keys(DEPARTMENT_LABELS) as Department[]).filter(
                        (item) => !selectedByOthers.has(item) || item === department,
                      );
                      return (
                        <div key={`meeting-department-${index}`} className="submissionBox">
                          <select
                            value={department}
                            onChange={(e) =>
                              setMeetingDepartmentAt(index, e.target.value as Department)
                            }
                          >
                            {options.map((item) => (
                              <option key={item} value={item}>
                                {DEPARTMENT_LABELS[item]}
                              </option>
                            ))}
                          </select>
                          {meetingSelectedDepartments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMeetingDepartmentField(index)}
                            >
                              -
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addMeetingDepartmentField}
                      disabled={!canAddMeetingDepartment}
                    >
                      + Departman Ekle
                    </button>
                  </div>
                )}
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={meetingIncludeInterns}
                    onChange={(e) => {
                      setMeetingIncludeInterns(e.target.checked);
                      setMeetingFieldError('');
                    }}
                  />{' '}
                  Stajyerler toplantiya katilabilir
                </label>
                {meetingFieldError && <p className="fieldError">{meetingFieldError}</p>}
                <div className="archiveActions">
                  <button type="submit" disabled={isSavingMeeting}>
                    {isSavingMeeting
                      ? 'Kaydediliyor...'
                      : meeting
                        ? 'Toplantiyi Guncelle'
                        : 'Toplantiyi Planla'}
                  </button>
                  {meeting && (
                    <button type="button" onClick={cancelMeetingPlan} disabled={isSavingMeeting}>
                      Toplantiyi Iptal Et
                    </button>
                  )}
                </div>
              </form>
              <p className="muted">
                Toplanti saatine 15 dakika kala seciminize gore aktif uyelere e-posta
                hatirlatmasi gonderilir.
              </p>
            </motion.div>
          )}
          {!loading && isCaptain && captainTab === 'settings' && (
            <motion.div
              key="captain-settings"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <form className="formBlock" onSubmit={changePassword}>
                <h3>Ayarlar</h3>
                <input
                  type="password"
                  placeholder="Mevcut sifre"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Yeni sifre"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Yeni sifre tekrar"
                  value={confirmNewPassword}
                  onChange={(e) => {
                    setConfirmNewPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                {settingsFieldError && <p className="fieldError">{settingsFieldError}</p>}
                <button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Degistiriliyor...' : 'Sifreyi Degistir'}
                </button>
              </form>
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
                  {activeTeamMembers.filter((x) => x.role === 'MEMBER').length} | AR-GE Lid.{' '}
                  {activeTeamMembers.filter((x) => x.role === 'RD_LEADER').length}
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
            <div className="cardGrid">
              {departmentOverviewStats.map((item) => (
                <article key={item.department} className="infoCard">
                  <h3>{DEPARTMENT_LABELS[item.department]}</h3>
                  <p>
                    Uye {item.memberCount} | Aktif Gorev {item.openCount}
                  </p>
                  <p className="muted">
                    Geciken {item.lateCount} | Kritik {item.criticalCount}
                  </p>
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => focusDepartmentInTasks(item.department)}
                  >
                    Gorevlere git ve departmani sec
                  </button>
                </article>
              ))}
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
            <div className="infoCard" style={{ overflowX: 'auto' }}>
              <h3>Üye Bazlı Performans</h3>
              {captainMemberStats.length === 0 ? (
                <p className="muted">Gösterilecek üye yok.</p>
              ) : (
                <table className="metricsTable">
                  <thead>
                    <tr>
                      <th>Üye</th>
                      <th>Rol</th>
                      <th>Toplam</th>
                      <th>Aktif</th>
                      <th>Tamamlanan</th>
                      <th>Geciken</th>
                      <th>Ort. Süre (gün)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {captainMemberStats.map(({ member, total, active, done, late, avgDays }) => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td className="muted">{member.role === 'RD_LEADER' ? 'AR-GE Lid.' : 'Üye'}</td>
                        <td><strong>{total}</strong></td>
                        <td>{active}</td>
                        <td style={{ color: done > 0 ? 'var(--accent)' : undefined }}>{done}</td>
                        <td style={{ color: late > 0 ? 'var(--danger)' : undefined }}>{late}</td>
                        <td className="muted">{avgDays !== null ? avgDays.toFixed(1) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="infoCard" style={{ marginTop: 16 }}>
              <h3>Grafiksel Özet</h3>
              <DashboardCharts tickets={tickets} />
            </div>
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'kanban' && (
            <motion.div
              key="captain-kanban"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h2 style={{ marginBottom: 16 }}>Kanban Board</h2>
              <KanbanBoard
                tickets={tickets}
                onStatusChange={async (ticketId, status) => {
                  try {
                    await apiFetch(`/tickets/${ticketId}/status`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status }),
                    });
                    setTickets((prev) =>
                      prev.map((t) =>
                        t.id === ticketId
                          ? { ...t, status, completedAt: status === 'DONE' ? new Date().toISOString() : t.completedAt }
                          : t,
                      ),
                    );
                  } catch {
                    showToast('error', 'Durum güncellenemedi');
                  }
                }}
              />
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'calendar' && (
            <motion.div
              key="captain-calendar"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h2 style={{ marginBottom: 16 }}>Takvim</h2>
              <CalendarView
                events={[
                  ...tickets
                    .filter((t) => t.dueAt && t.status !== 'DONE')
                    .map((t) => ({ date: t.dueAt!, type: 'deadline' as const, label: t.title, id: `ticket-${t.id}` })),
                  ...(meeting && !meeting.reminderSentAt
                    ? [{ date: meeting.scheduledAt, type: 'meeting' as const, label: meeting.meetingUrl ? 'Toplantı' : 'Toplantı', id: `meeting-${meeting.id}` }]
                    : []),
                  ...leaves
                    .filter((l) => l.status === 'APPROVED')
                    .map((l) => ({ date: l.startDate, type: 'leave' as const, label: l.member?.name ?? 'İzin', id: `leave-${l.id}` })),
                ]}
              />
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'audit' && (
            <motion.div
              key="captain-audit"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h2 style={{ marginBottom: 16 }}>Aktivite Logu</h2>
              <AuditLogFeed
                logs={auditLogs}
                total={auditTotal}
                page={auditPage}
                pageSize={20}
                loading={auditLoading}
                onPageChange={(page) => loadAuditLogs(page)}
              />
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
                  <option value="RD_LEADER">AR-GE Lideri</option>
                </select>
                <select
                  value={teamDepartmentFilter}
                  onChange={(e) =>
                    setTeamDepartmentFilter(e.target.value as 'ALL' | Department)
                  }
                >
                  <option value="ALL">Tum Departmanlar</option>
                  {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
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
                  {(['MEMBER', 'RD_LEADER', 'BOARD', 'CAPTAIN'] as TeamRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <select
                  value={memberPrimaryDepartment}
                  onChange={(e) => setMemberPrimaryDepartment(e.target.value as Department)}
                >
                  {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => (
                    <option key={department} value={department}>
                      1. Departman (zorunlu): {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </select>
                <select
                  value={memberSecondaryDepartment}
                  onChange={(e) =>
                    setMemberSecondaryDepartment(e.target.value as '' | Department)
                  }
                >
                  <option value="">2. Departman (opsiyonel)</option>
                  {(Object.keys(DEPARTMENT_LABELS) as Department[])
                    .filter((department) => department !== memberPrimaryDepartment)
                    .map((department) => (
                      <option key={department} value={department}>
                        {DEPARTMENT_LABELS[department]}
                      </option>
                    ))}
                </select>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={memberIsIntern}
                    onChange={(e) => setMemberIsIntern(e.target.checked)}
                  />{' '}
                  Stajyer
                </label>
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
                      <div className="muted">
                        Departman:{' '}
                        {(m.departments ?? []).length > 0
                          ? (m.departments ?? [])
                              .map((x) => DEPARTMENT_LABELS[x.department])
                              .join(', ')
                          : '-'}
                        {m.isIntern ? ' | Stajyer' : ''}
                      </div>
                    </div>
                    <div className="archiveActions">
                      {m.isIntern && (
                        <button type="button" onClick={() => promoteInternToMember(m.id)}>
                          Takim Uyesine Yukselt
                        </button>
                      )}
                      {!m.isIntern && m.role === 'MEMBER' && (
                        <button type="button" onClick={() => promoteMemberToBoard(m.id)}>
                          Kurula Yukselt
                        </button>
                      )}
                      {m.role === 'CAPTAIN' || m.id === currentUser?.id ? (
                        <span className="muted">Kaptan hesabi</span>
                      ) : (
                        <button type="button" onClick={() => deactivateMember(m.id)}>
                          Pasiflestir
                        </button>
                      )}
                    </div>
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
                {templates.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const tid = e.target.value;
                        setSelectedTemplateId(tid);
                        const tpl = templates.find((t) => t.id === tid);
                        if (tpl) {
                          setTicketTitle(tpl.title);
                          setTicketDesc(tpl.description ?? '');
                          setTicketPriority(tpl.priority);
                        }
                      }}
                      style={{ flex: 1 }}
                    >
                      <option value="">Şablondan yükle...</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                )}
                <input
                  placeholder="Gorev basligi"
                  value={ticketTitle}
                  onChange={(e) => {
                    setTicketTitle(e.target.value);
                    setTicketFieldError('');
                    setSelectedTemplateId('');
                  }}
                  required
                />
                <textarea placeholder="Aciklama" value={ticketDesc} onChange={(e) => { setTicketDesc(e.target.value); setSelectedTemplateId(''); }} />
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
                  value={ticketAssignmentMode}
                  onChange={(e) =>
                    setTicketAssignmentMode(e.target.value as 'MANUAL' | 'DEPARTMENT')
                  }
                >
                  <option value="MANUAL">Atama: Manuel</option>
                  <option value="DEPARTMENT">Atama: Departman Bazli</option>
                </select>
                {ticketAssignmentMode === 'MANUAL' && (
                  <>
                    <select
                      value={ticketManualDepartmentFilter}
                      onChange={(e) =>
                        setTicketManualDepartmentFilter(e.target.value as 'ALL' | Department)
                      }
                    >
                      <option value="ALL">Atanan filtresi: Tum departmanlar</option>
                      {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => (
                        <option key={department} value={department}>
                          Atanan filtresi: {DEPARTMENT_LABELS[department]}
                        </option>
                      ))}
                    </select>
                    {ticketManualAssigneeIds.map((selectedMemberId, index) => {
                      const selectedByOthers = new Set(
                        ticketManualAssigneeIds.filter((id, idx) => idx !== index && Boolean(id)),
                      );
                      const selectableMembers = manualAssignableMembers.filter(
                        (member) =>
                          !selectedByOthers.has(member.id) || member.id === selectedMemberId,
                      );
                      const placeholder =
                        index === 0
                          ? '1. atanan (zorunlu)'
                          : `${index + 1}. atanan (opsiyonel)`;

                      return (
                        <div key={`manual-assignee-${index}`} className="submissionBox">
                          <select
                            value={selectedMemberId}
                            onChange={(e) => setManualAssigneeAt(index, e.target.value)}
                            required={index === 0}
                          >
                            <option value="">{placeholder}</option>
                            {selectableMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          {index >= 2 && (
                            <button
                              type="button"
                              onClick={() => removeManualAssigneeField(index)}
                            >
                              -
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addManualAssigneeField}
                      disabled={!canAddManualAssigneeField}
                    >
                      + Atanan Ekle
                    </button>
                  </>
                )}
                {ticketAssignmentMode === 'DEPARTMENT' && (
                  <>
                    <select
                      value={ticketTargetDepartment}
                      onChange={(e) =>
                        setTicketTargetDepartment(e.target.value as Department)
                      }
                    >
                      {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => (
                        <option key={department} value={department}>
                          Departman: {DEPARTMENT_LABELS[department]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ticketDepartmentSelectionMode}
                      onChange={(e) =>
                        setTicketDepartmentSelectionMode(e.target.value as 'ALL' | 'SELECTED')
                      }
                    >
                      <option value="ALL">Departmandaki tum uyeler</option>
                      <option value="SELECTED">Departmandan secili uyeler</option>
                    </select>
                    {ticketDepartmentSelectionMode === 'SELECTED' && (
                      <div className="submissionBox">
                        {activeMembersInTargetDepartment.map((member) => (
                          <label key={member.id} className="muted">
                            <input
                              type="checkbox"
                              checked={ticketDepartmentMemberIds.includes(member.id)}
                              onChange={(e) => {
                                setTicketDepartmentMemberIds((prev) =>
                                  e.target.checked
                                    ? [...new Set([...prev, member.id])]
                                    : prev.filter((id) => id !== member.id),
                                );
                              }}
                            />{' '}
                            {member.name}
                          </label>
                        ))}
                        {activeMembersInTargetDepartment.length === 0 && (
                          <p className="muted">Bu departmanda aktif uye yok.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
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
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: 'var(--muted)' }}>Bağımlılıklar (önce tamamlanması gerekenler):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {tickets.filter((t) => t.status !== 'DONE').map((t) => (
                      <label key={t.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={ticketDependencyIds.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) setTicketDependencyIds((prev) => [...prev, t.id]);
                            else setTicketDependencyIds((prev) => prev.filter((id) => id !== t.id));
                          }}
                        />
                        {t.title}
                      </label>
                    ))}
                    {tickets.filter((t) => t.status !== 'DONE').length === 0 && (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Bağımlılık eklenebilecek görev yok</span>
                    )}
                  </div>
                </div>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                  <input
                    type="checkbox"
                    checked={ticketSaveAsTemplate}
                    onChange={(e) => setTicketSaveAsTemplate(e.target.checked)}
                  />
                  Bu görevi şablon olarak kaydet
                </label>
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
                    {ticket.dependencies && ticket.dependencies.some((d) => d.dependsOn.status !== 'DONE') && (
                      <div style={{ background: 'rgba(240,180,41,0.12)', border: '1px solid #f0b429', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#f0b429', marginBottom: 6 }}>
                        ⛓️ Tamamlanmamış bağımlılık:{' '}
                        {ticket.dependencies.filter((d) => d.dependsOn.status !== 'DONE').map((d) => d.dependsOn.title).join(', ')}
                      </div>
                    )}
                    <CommentPanel
                      ticketId={ticket.id}
                      openCommentTicketId={openCommentTicketId}
                      commentLoadingTicketId={commentLoadingTicketId}
                      submittingCommentTicketId={submittingCommentTicketId}
                      ticketComments={ticketComments}
                      commentDrafts={commentDrafts}
                      onToggle={toggleComments}
                      onDraftChange={(id, val) => setCommentDrafts((prev) => ({ ...prev, [id]: val }))}
                      onSubmit={submitComment}
                      currentUserId={currentUser?.id}
                      teamMembers={activeTeamMembers}
                      onReact={handleReaction}
                    />
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
                  value={captainMemberDepartmentFilter}
                  onChange={(e) =>
                    setCaptainMemberDepartmentFilter(e.target.value as 'ALL' | Department)
                  }
                >
                  <option value="ALL">Tum Departmanlar</option>
                  {captainDepartmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </select>
                <select
                  value={captainMemberFocusId}
                  onChange={(e) => setCaptainMemberFocusId(e.target.value)}
                >
                  {captainMemberPages.length === 0 ? (
                    <option value="">Uye bulunamadi</option>
                  ) : (
                    captainMemberPages.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))
                  )}
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
                          <CommentPanel
                            ticketId={ticket.id}
                            openCommentTicketId={openCommentTicketId}
                            commentLoadingTicketId={commentLoadingTicketId}
                            submittingCommentTicketId={submittingCommentTicketId}
                            ticketComments={ticketComments}
                            commentDrafts={commentDrafts}
                            onToggle={toggleComments}
                            onDraftChange={(id, val) => setCommentDrafts((prev) => ({ ...prev, [id]: val }))}
                            onSubmit={submitComment}
                            currentUserId={currentUser?.id}
                            teamMembers={activeTeamMembers}
                            onReact={handleReaction}
                          />
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
                            <button type="button" onClick={() => openFilePreview(latestSubmission)}>
                              Onizle
                            </button>
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
          {!loading && !isCaptain && memberTab === 'settings' && (
            <motion.div
              key="member-settings"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <form className="formBlock" onSubmit={changePassword}>
                <h3>Ayarlar</h3>
                <input
                  type="password"
                  placeholder="Mevcut sifre"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Yeni sifre"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Yeni sifre tekrar"
                  value={confirmNewPassword}
                  onChange={(e) => {
                    setConfirmNewPassword(e.target.value);
                    setSettingsFieldError('');
                  }}
                  required
                />
                {settingsFieldError && <p className="fieldError">{settingsFieldError}</p>}
                <button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Degistiriliyor...' : 'Sifreyi Degistir'}
                </button>
              </form>
            </motion.div>
          )}
          {!loading && !isCaptain && isBoard && memberTab === 'all_tasks' && (
            <motion.div
              key="board-all-tasks"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="filterRow">
                <input
                  placeholder="Tum gorevlerde ara"
                  value={boardAllTaskSearch}
                  onChange={(e) => setBoardAllTaskSearch(e.target.value)}
                />
                <select
                  value={boardAllTaskStatusFilter}
                  onChange={(e) =>
                    setBoardAllTaskStatusFilter(e.target.value as 'ALL' | TicketStatus)
                  }
                >
                  <option value="ALL">Tum Durumlar</option>
                  {STATUS_LIST.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <select
                  value={boardAllTaskDepartmentFilter}
                  onChange={(e) =>
                    setBoardAllTaskDepartmentFilter(e.target.value as 'ALL' | Department)
                  }
                >
                  <option value="ALL">Tum Departmanlar</option>
                  {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((department) => (
                    <option key={department} value={department}>
                      {DEPARTMENT_LABELS[department]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ticketStack">
                {boardAllTickets.map((ticket) => (
                  <article key={ticket.id} className="ticketCard">
                    <strong>{ticket.title}</strong>
                    <p>{ticket.description || '-'}</p>
                    <div className="ticketMeta">
                      <span>{PRIORITY_LABELS[ticket.priority]}</span>
                      <span>{STATUS_LABELS[ticket.status]}</span>
                    </div>
                    <p className="muted">
                      Atananlar:{' '}
                      {ticket.assignees.length > 0
                        ? ticket.assignees.map((a) => a.member.name).join(', ')
                        : 'Yok'}
                    </p>
                  </article>
                ))}
                {boardAllTickets.length === 0 && (
                  <p className="muted">Bu filtreyle gorev bulunamadi.</p>
                )}
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
                    {ticket.dependencies && ticket.dependencies.some((d) => d.dependsOn.status !== 'DONE') && (
                      <div style={{ background: 'rgba(240,180,41,0.12)', border: '1px solid #f0b429', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#f0b429', marginBottom: 6 }}>
                        ⛓️ Tamamlanmamış bağımlılık:{' '}
                        {ticket.dependencies.filter((d) => d.dependsOn.status !== 'DONE').map((d) => d.dependsOn.title).join(', ')}
                      </div>
                    )}
                    {ticket.reviewNote && (
                      <p className="fieldError">Teslim ret sebebi: {ticket.reviewNote}</p>
                    )}
                    {ticket.submissions.filter((submission) => submission.submittedBy.role === 'CAPTAIN').length > 0 && (
                      <div className="submissionBox">
                        <h4>Kaptandan Gelen Dosyalar</h4>
                        {ticket.submissions
                          .filter((submission) => submission.submittedBy.role === 'CAPTAIN')
                          .map((submission) => (
                            <div key={submission.id} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem' }}>{submission.fileName}</span>
                              <button type="button" onClick={() => openFilePreview(submission)}>Önizle</button>
                              <button type="button" onClick={() => downloadSubmission(submission)}>İndir</button>
                            </div>
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
                    <CommentPanel
                      ticketId={ticket.id}
                      openCommentTicketId={openCommentTicketId}
                      commentLoadingTicketId={commentLoadingTicketId}
                      submittingCommentTicketId={submittingCommentTicketId}
                      ticketComments={ticketComments}
                      commentDrafts={commentDrafts}
                      onToggle={toggleComments}
                      onDraftChange={(id, val) => setCommentDrafts((prev) => ({ ...prev, [id]: val }))}
                      onSubmit={submitComment}
                      currentUserId={currentUser?.id}
                      teamMembers={activeTeamMembers}
                      onReact={handleReaction}
                    />
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
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => openFilePreview(submission)}>
                      Önizle
                    </button>
                    <button type="button" onClick={() => downloadSubmission(submission)}>
                      İndir
                    </button>
                    <button type="button" className="dangerBtn" onClick={() => deleteSubmission(submission)}>
                      Sil
                    </button>
                  </div>
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

          {!loading && !isCaptain && memberTab === 'calendar' && (
            <motion.div
              key="member-calendar"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h2 style={{ marginBottom: 16 }}>Takvim</h2>
              <CalendarView
                events={[
                  ...myTickets
                    .filter((t) => t.dueAt && t.status !== 'DONE')
                    .map((t) => ({ date: t.dueAt!, type: 'deadline' as const, label: t.title, id: `ticket-${t.id}` })),
                  ...(meeting ? [{ date: meeting.scheduledAt, type: 'meeting' as const, label: 'Toplantı', id: `meeting-${meeting.id}` }] : []),
                  ...myLeaves
                    .filter((l) => l.status === 'APPROVED')
                    .map((l) => ({ date: l.startDate, type: 'leave' as const, label: 'İzin', id: `leave-${l.id}` })),
                ]}
              />
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'announcements' && (
            <motion.div
              key="captain-announcements"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <form className="formBlock" onSubmit={createAnnouncement}>
                <h3>Yeni Duyuru</h3>
                <input
                  placeholder="Baslik"
                  value={announcementTitle}
                  onChange={(e) => { setAnnouncementTitle(e.target.value); setAnnouncementFieldError(''); }}
                  required
                />
                <textarea
                  placeholder="Icerik"
                  value={announcementContent}
                  onChange={(e) => { setAnnouncementContent(e.target.value); setAnnouncementFieldError(''); }}
                  required
                />
                {announcementFieldError && <p className="fieldError">{announcementFieldError}</p>}
                <button type="submit" disabled={isSubmittingAnnouncement}>
                  {isSubmittingAnnouncement ? 'Gonderiliyor...' : 'Duyuru Olustur'}
                </button>
              </form>
              <ul className="submissionRows" style={{ marginTop: '1.5rem' }}>
                {announcements.map((a) => (
                  <li key={a.id}>
                    <div>
                      <strong>{a.title}</strong>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{a.content}</p>
                      <p className="muted" style={{ fontSize: '0.8rem' }}>
                        {a.createdBy.name} &mdash; {new Date(a.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <button type="button" className="dangerBtn" onClick={() => deleteAnnouncement(a.id)}>
                      Sil
                    </button>
                  </li>
                ))}
                {announcements.length === 0 && <p className="muted">Henuz duyuru yok.</p>}
              </ul>
            </motion.div>
          )}

          {!loading && isCaptain && captainTab === 'leaves' && (
            <motion.div
              key="captain-leaves"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h3>Izin Talepleri</h3>
              <ul className="submissionRows" style={{ marginTop: '1rem' }}>
                {leaves.map((leave) => (
                  <li key={leave.id}>
                    <div style={{ flex: 1 }}>
                      <strong>{leave.member?.name ?? '—'}</strong>
                      <p>
                        {new Date(leave.startDate).toLocaleDateString('tr-TR')} &ndash;{' '}
                        {new Date(leave.endDate).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="muted">{leave.reason}</p>
                      <span className={`fileBadge type-${leave.status.toLowerCase()}`}>{leave.status === 'PENDING' ? 'Bekliyor' : leave.status === 'APPROVED' ? 'Onaylandi' : 'Reddedildi'}</span>
                      {leave.reviewNote && <p className="muted" style={{ fontSize: '0.8rem' }}>Not: {leave.reviewNote}</p>}
                    </div>
                    {leave.status === 'PENDING' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '160px' }}>
                        {reviewingLeaveId === leave.id ? (
                          <>
                            <input
                              placeholder="Inceleme notu (opsiyonel)"
                              value={leaveReviewNote}
                              onChange={(e) => setLeaveReviewNote(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button type="button" onClick={() => reviewLeave(leave.id, 'APPROVED')}>Onayla</button>
                              <button type="button" className="dangerBtn" onClick={() => reviewLeave(leave.id, 'REJECTED')}>Reddet</button>
                              <button type="button" className="bugSecondaryBtn" onClick={() => { setReviewingLeaveId(null); setLeaveReviewNote(''); }}>Vazgec</button>
                            </div>
                          </>
                        ) : (
                          <button type="button" onClick={() => setReviewingLeaveId(leave.id)}>Incele</button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
                {leaves.length === 0 && <p className="muted">Henuz izin talebi yok.</p>}
              </ul>
            </motion.div>
          )}

          {!loading && !isCaptain && memberTab === 'announcements' && (
            <motion.div
              key="member-announcements"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <h3>Duyurular</h3>
              <ul className="submissionRows" style={{ marginTop: '1rem' }}>
                {announcements.map((a) => (
                  <li key={a.id}>
                    <div>
                      <strong>{a.title}</strong>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{a.content}</p>
                      <p className="muted" style={{ fontSize: '0.8rem' }}>
                        {a.createdBy.name} &mdash; {new Date(a.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                  </li>
                ))}
                {announcements.length === 0 && <p className="muted">Henuz duyuru yok.</p>}
              </ul>
            </motion.div>
          )}

          {!loading && !isCaptain && memberTab === 'my_leaves' && (
            <motion.div
              key="member-leaves"
              className="tabScene"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <form className="formBlock" onSubmit={createLeave}>
                <h3>Izin Talebi Olustur</h3>
                <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Baslangic Tarihi</label>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => { setLeaveStartDate(e.target.value); setLeaveFieldError(''); }}
                  required
                />
                <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Bitis Tarihi</label>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => { setLeaveEndDate(e.target.value); setLeaveFieldError(''); }}
                  required
                />
                <input
                  placeholder="Sebep"
                  value={leaveReason}
                  onChange={(e) => { setLeaveReason(e.target.value); setLeaveFieldError(''); }}
                  required
                />
                {leaveFieldError && <p className="fieldError">{leaveFieldError}</p>}
                <button type="submit" disabled={isSubmittingLeave}>
                  {isSubmittingLeave ? 'Gonderiliyor...' : 'Talep Gonder'}
                </button>
              </form>
              <ul className="submissionRows" style={{ marginTop: '1.5rem' }}>
                {myLeaves.map((leave) => (
                  <li key={leave.id}>
                    <div>
                      <p>
                        <strong>{new Date(leave.startDate).toLocaleDateString('tr-TR')}</strong>
                        {' '}&ndash;{' '}
                        <strong>{new Date(leave.endDate).toLocaleDateString('tr-TR')}</strong>
                      </p>
                      <p className="muted">{leave.reason}</p>
                      <span className={`fileBadge type-${leave.status.toLowerCase()}`}>{leave.status === 'PENDING' ? 'Bekliyor' : leave.status === 'APPROVED' ? 'Onaylandi' : 'Reddedildi'}</span>
                      {leave.reviewNote && <p className="muted" style={{ fontSize: '0.8rem' }}>Not: {leave.reviewNote}</p>}
                    </div>
                  </li>
                ))}
                {myLeaves.length === 0 && <p className="muted">Henuz izin talebiniz yok.</p>}
              </ul>
            </motion.div>
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
      {previewSub && (
        <div className="previewBackdrop" role="dialog" aria-modal="true" onClick={closeFilePreview}>
          <section className="previewModal panel" onClick={(e) => e.stopPropagation()}>
            <div className="previewHeader">
              <span className="previewTitle">{previewSub.fileName}</span>
              <button type="button" className="previewCloseBtn" onClick={closeFilePreview} aria-label="Kapat">✕</button>
            </div>
            <div className="previewBody">
              {previewLoading && <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Dosya yükleniyor...</p>}
              {!previewLoading && previewBlobUrl && previewBlobUrl !== 'docx' && previewSub.fileName.toLowerCase().endsWith('.pdf') && (
                <iframe
                  src={previewBlobUrl}
                  title={previewSub.fileName}
                  className="previewFrame"
                />
              )}
              {previewBlobUrl === 'docx' && (
                <div ref={docxContainerRef} className="previewDocx" />
              )}
              {!previewLoading && previewBlobUrl && previewBlobUrl !== 'docx' && !previewSub.fileName.toLowerCase().endsWith('.pdf') && (
                <div style={{ display: 'grid', gap: '1rem', placeItems: 'center', padding: '3rem 1rem' }}>
                  <p className="muted">Bu dosya formatı ({previewSub.fileName.split('.').pop()?.toUpperCase()}) tarayıcıda önizlenemiyor.</p>
                  <button type="button" onClick={() => downloadSubmission(previewSub)}>Dosyayı İndir</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {deleteConfirmSubmission && (
        <div className="bugModalBackdrop" role="dialog" aria-modal="true">
          <section className="bugModal panel">
            <h3>Teslimi Sil</h3>
            <p className="muted">
              <strong>"{deleteConfirmSubmission.fileName}"</strong> adlı teslim kalıcı olarak silinecek.
            </p>
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Bu işlem <strong>geri alınamaz</strong> ve teslim <strong>herkes tarafından görülemez</strong> hale gelir.
            </p>
            <div className="bugModalActions" style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                className="bugSecondaryBtn"
                onClick={() => setDeleteConfirmSubmission(null)}
                disabled={isDeletingSubmission}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="dangerBtn"
                onClick={confirmDeleteSubmission}
                disabled={isDeletingSubmission}
              >
                {isDeletingSubmission ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </section>
        </div>
      )}
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



























