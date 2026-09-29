import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Lock,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  Utensils,
  X,
} from 'lucide-react';
import { auth, googleProvider, isLiveFirebaseConfig } from './firebase';
import {
  CLASSROOM_TIMETABLE,
  WEEKLY_CLASSROOM_DUTY,
} from './data/initialClassroomData';
import {
  getInitialClassroomState,
  persistAnnouncements,
  persistCounselingRequests,
  persistLunchMenus,
  persistPosts,
  persistSchedules,
  subscribeLiveFirestoreCollections,
  validateAnnouncementInput,
  validateCounselingInput,
  validatePostInput,
} from './services/classroomService';
import {
  AcademicSchedule,
  Announcement,
  AnnouncementCategory,
  CommunityPost,
  CounselingRequest,
  CounselingStatus,
  CounselingTopic,
  LunchMenu,
  PostComment,
  PostTopic,
  ScheduleEventType,
  TargetGradeScope,
  UserSessionProfile,
} from './types/classroom';

import heroBannerImg from './assets/images/classroom_hero_banner_1790651832122.jpg';
import lunchTrayImg from './assets/images/lunch_tray_preview_1790651843851.jpg';
import teacherAvatarImg from './assets/images/teacher_avatar_1790651854129.jpg';

type ActiveSection = 'home' | 'announcements' | 'community' | 'lunch' | 'schedule';

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  notice: '학급 공지',
  letter: '가정통신문',
  assignment: '수행·과제',
  event: '행사 안내',
};

const TOPIC_LABELS: Record<PostTopic, string> = {
  question: '질문해요',
  praise: '칭찬 릴레이',
  suggestion: '학급 건의함',
  free: '자유 소통',
};

const POST_STATUS_LABELS: Record<CommunityPost['status'], string> = {
  open: '소통 진행중',
  answered: '선생님 답변완료',
  archived: '보관됨',
};

const SCHEDULE_TYPE_LABELS: Record<ScheduleEventType, string> = {
  exam: '지필평가',
  performance: '수행평가',
  activity: '체험·행사',
  holiday: '공휴일·휴업',
  school: '학교일정',
};

const COUNSELING_TOPIC_LABELS: Record<CounselingTopic, string> = {
  study: '학업·성적 고민',
  friendship: '교우관계',
  career: '진로·진학',
  health: '건강·생활',
  other: '기타 이야기',
};

const COUNSELING_STATUS_LABELS: Record<CounselingStatus, string> = {
  pending: '선생님 확인 대기',
  scheduled: '상담 일정 확정',
  completed: '상담 완료',
};

function formatKoreanDate(isoOrDate: string): string {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function getDdayLabel(targetDateStr: string): string {
  const today = new Date('2026-09-29T00:00:00');
  const target = new Date(`${targetDateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return '';
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'D-Day';
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

export default function App() {
  const initialData = useMemo(() => getInitialClassroomState(), []);

  const [activeSection, setActiveSection] = useState<ActiveSection>('home');
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialData.announcements);
  const [posts, setPosts] = useState<CommunityPost[]>(initialData.posts);
  const [lunchMenus, setLunchMenus] = useState<LunchMenu[]>(initialData.lunchMenus);
  const [schedules, setSchedules] = useState<AcademicSchedule[]>(initialData.schedules);
  const [counselingRequests, setCounselingRequests] = useState<CounselingRequest[]>(
    initialData.counselingRequests
  );

  // User Role Session (Supports instant Teacher <-> Student role preview + Google Auth)
  const [userProfile, setUserProfile] = useState<UserSessionProfile>({
    uid: 'teacher_heeju',
    name: '이희주 담임교사',
    email: 'heeju3185@gmail.com',
    role: 'teacher',
  });

  // Image error resilience states
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [lunchImgFailed, setLunchImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);

  // Filter & Search states
  const [announcementFilter, setAnnouncementFilter] = useState<'all' | AnnouncementCategory>('all');
  const [announcementSearch, setAnnouncementSearch] = useState('');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const [postTopicFilter, setPostTopicFilter] = useState<'all' | PostTopic>('all');
  const [postSearch, setPostSearch] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string>(
    initialData.posts[0]?.id || ''
  );

  const [selectedLunchId, setSelectedLunchId] = useState<string>(
    initialData.lunchMenus[1]?.id || initialData.lunchMenus[0]?.id || ''
  );

  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<'all' | ScheduleEventType>('all');

  // Modals & Form states
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [newAnnouncementForm, setNewAnnouncementForm] = useState<{
    title: string;
    category: AnnouncementCategory;
    content: string;
    dueDate: string;
    isPinned: boolean;
  }>({
    title: '',
    category: 'notice',
    content: '',
    dueDate: '2026-10-08',
    isPinned: false,
  });

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [newPostForm, setNewPostForm] = useState<{
    topic: PostTopic;
    title: string;
    body: string;
    authorName: string;
    studentNumber: string;
  }>({
    topic: 'question',
    title: '',
    body: '',
    authorName: '김민준',
    studentNumber: '4',
  });

  const [commentInput, setCommentInput] = useState('');
  const [teacherReplyInput, setTeacherReplyInput] = useState('');

  const [isLunchEditModalOpen, setIsLunchEditModalOpen] = useState(false);
  const [editingLunch, setEditingLunch] = useState<LunchMenu | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [newScheduleForm, setNewScheduleForm] = useState<{
    date: string;
    endDate: string;
    title: string;
    eventType: ScheduleEventType;
    description: string;
    targetGrade: TargetGradeScope;
  }>({
    date: '2026-10-12',
    endDate: '',
    title: '',
    eventType: 'performance',
    description: '',
    targetGrade: 'class2_3',
  });

  const [newCounselingForm, setNewCounselingForm] = useState<{
    topic: CounselingTopic;
    preferredDate: string;
    message: string;
    studentName: string;
  }>({
    topic: 'study',
    preferredDate: '2026-10-06',
    message: '',
    studentName: '김민준 (4번)',
  });
  const [counselingReplyDrafts, setCounselingReplyDrafts] = useState<Record<string, string>>({});

  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLiveFirebaseConfig) return;
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const isTeacherEmail = firebaseUser.email === 'heeju3185@gmail.com';
        setUserProfile({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || (isTeacherEmail ? '이희주 담임교사' : '해솔반 학생'),
          email: firebaseUser.email || '',
          role: isTeacherEmail ? 'teacher' : 'student',
          studentNumber: isTeacherEmail ? undefined : '4',
        });
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsub = subscribeLiveFirestoreCollections({
      onAnnouncements: setAnnouncements,
      onPosts: setPosts,
      onLunchMenus: setLunchMenus,
      onSchedules: setSchedules,
      onCounseling: setCounselingRequests,
    });
    return () => unsub();
  }, [userProfile.uid]);

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleToggleRole = () => {
    if (userProfile.role === 'teacher') {
      setUserProfile({
        uid: 'student_minjun',
        name: '김민준',
        email: 'minjun@haesol.ms.kr',
        role: 'student',
        studentNumber: '4',
      });
      showToast('학생 화면(4번 김민준)으로 전환되었습니다. 질문 작성과 1:1 비공개 상담 신청을 체험해 보세요.');
    } else {
      setUserProfile({
        uid: 'teacher_heeju',
        name: '이희주 담임교사',
        email: 'heeju3185@gmail.com',
        role: 'teacher',
      });
      showToast('담임교사 관리 모드로 전환되었습니다. 공지 등록, 급식·일정 편집, 학생 답변 작성이 가능합니다.');
    }
  };

  const handleGoogleAuth = async () => {
    if (!isLiveFirebaseConfig) {
      handleToggleRole();
      return;
    }
    try {
      if (auth.currentUser) {
        await signOut(auth);
        showToast('로그아웃되었습니다.');
      } else {
        await signInWithPopup(auth, googleProvider);
        showToast('Google 계정으로 로그인되었습니다.');
      }
    } catch {
      handleToggleRole();
    }
  };

  // Filtered lists
  const filteredAnnouncements = useMemo(() => {
    return announcements
      .filter((item) => {
        if (announcementFilter !== 'all' && item.category !== announcementFilter) {
          return false;
        }
        if (announcementSearch.trim()) {
          const q = announcementSearch.trim().toLowerCase();
          return (
            item.title.toLowerCase().includes(q) ||
            item.content.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [announcements, announcementFilter, announcementSearch]);

  const filteredPosts = useMemo(() => {
    return posts
      .filter((post) => {
        if (postTopicFilter !== 'all' && post.topic !== postTopicFilter) {
          return false;
        }
        if (postSearch.trim()) {
          const q = postSearch.trim().toLowerCase();
          return (
            post.title.toLowerCase().includes(q) ||
            post.body.toLowerCase().includes(q) ||
            post.authorName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [posts, postTopicFilter, postSearch]);

  const activePost = useMemo(
    () => posts.find((p) => p.id === selectedPostId) || filteredPosts[0] || null,
    [posts, selectedPostId, filteredPosts]
  );

  const activeLunch = useMemo(
    () => lunchMenus.find((m) => m.id === selectedLunchId) || lunchMenus[0],
    [lunchMenus, selectedLunchId]
  );

  const filteredSchedules = useMemo(() => {
    return schedules
      .filter((s) => scheduleTypeFilter === 'all' || s.eventType === scheduleTypeFilter)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, scheduleTypeFilter]);

  const visibleCounselingRequests = useMemo(() => {
    if (userProfile.role === 'teacher') {
      return counselingRequests;
    }
    return counselingRequests.filter((req) => req.authorId === userProfile.uid);
  }, [counselingRequests, userProfile]);

  // Handlers: Announcements
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const validationErr = validateAnnouncementInput({
      title: newAnnouncementForm.title,
      content: newAnnouncementForm.content,
      dueDate: newAnnouncementForm.dueDate || undefined,
    });
    if (validationErr) {
      setFormError(validationErr);
      return;
    }
    const now = new Date().toISOString();
    const created: Announcement = {
      id: `notice_${Date.now()}`,
      title: newAnnouncementForm.title.trim(),
      category: newAnnouncementForm.category,
      content: newAnnouncementForm.content.trim(),
      isPinned: newAnnouncementForm.isPinned,
      dueDate: newAnnouncementForm.dueDate || undefined,
      authorId: userProfile.uid,
      authorName: userProfile.name,
      createdAt: now,
      updatedAt: now,
    };
    const next = [created, ...announcements];
    setAnnouncements(next);
    await persistAnnouncements(next, created);
    setNewAnnouncementForm({
      title: '',
      category: 'notice',
      content: '',
      dueDate: '2026-10-08',
      isPinned: false,
    });
    setIsAnnouncementModalOpen(false);
    showToast('새 학급 안내사항이 등록되었습니다.');
  };

  const handleTogglePinAnnouncement = async (target: Announcement) => {
    if (userProfile.role !== 'teacher') return;
    const updated: Announcement = {
      ...target,
      isPinned: !target.isPinned,
      updatedAt: new Date().toISOString(),
    };
    const next = announcements.map((a) => (a.id === target.id ? updated : a));
    setAnnouncements(next);
    await persistAnnouncements(next, updated);
    showToast(updated.isPinned ? '공지사항을 상단에 고정했습니다.' : '상단 고정을 해제했습니다.');
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (userProfile.role !== 'teacher') return;
    const next = announcements.filter((a) => a.id !== id);
    setAnnouncements(next);
    if (selectedAnnouncement?.id === id) {
      setSelectedAnnouncement(null);
    }
    await persistAnnouncements(next, undefined, id);
    showToast('안내사항이 삭제되었습니다.');
  };

  // Handlers: Community Posts & Comments
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const validationErr = validatePostInput({
      title: newPostForm.title,
      body: newPostForm.body,
      studentNumber: userProfile.role === 'student' ? newPostForm.studentNumber : undefined,
    });
    if (validationErr) {
      setFormError(validationErr);
      return;
    }
    const now = new Date().toISOString();
    const created: CommunityPost = {
      id: `post_${Date.now()}`,
      topic: newPostForm.topic,
      title: newPostForm.title.trim(),
      body: newPostForm.body.trim(),
      authorId: userProfile.uid,
      authorName:
        userProfile.role === 'teacher'
          ? userProfile.name
          : newPostForm.authorName.trim() || userProfile.name,
      studentNumber:
        userProfile.role === 'student'
          ? newPostForm.studentNumber.trim() || '4'
          : undefined,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      comments: [],
    };
    const next = [created, ...posts];
    setPosts(next);
    setSelectedPostId(created.id);
    await persistPosts(next, { type: 'create', post: created });
    setNewPostForm({
      topic: 'question',
      title: '',
      body: '',
      authorName: '김민준',
      studentNumber: '4',
    });
    setIsPostModalOpen(false);
    showToast('우리반 소통 마당에 새 글이 등록되었습니다.');
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost || !commentInput.trim()) return;
    const now = new Date().toISOString();
    const newComment: PostComment = {
      id: `comment_${Date.now()}`,
      postId: activePost.id,
      content: commentInput.trim().slice(0, 500),
      authorId: userProfile.uid,
      authorName:
        userProfile.role === 'teacher'
          ? '이희주 담임교사'
          : `${userProfile.name} (${userProfile.studentNumber || '4'}번)`,
      createdAt: now,
      updatedAt: now,
    };
    const updatedPost: CommunityPost = {
      ...activePost,
      comments: [...(activePost.comments || []), newComment],
      updatedAt: now,
    };
    const next = posts.map((p) => (p.id === activePost.id ? updatedPost : p));
    setPosts(next);
    setCommentInput('');
    await persistPosts(next, {
      type: 'comment',
      post: updatedPost,
      comment: newComment,
    });
    showToast('댓글이 등록되었습니다.');
  };

  const handleSaveTeacherReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost || userProfile.role !== 'teacher' || !teacherReplyInput.trim()) return;
    const updatedPost: CommunityPost = {
      ...activePost,
      status: 'answered',
      teacherReply: teacherReplyInput.trim().slice(0, 1000),
      updatedAt: new Date().toISOString(),
    };
    const next = posts.map((p) => (p.id === activePost.id ? updatedPost : p));
    setPosts(next);
    setTeacherReplyInput('');
    await persistPosts(next, { type: 'reply', post: updatedPost });
    showToast('담임교사 공식 답변이 저장되었습니다.');
  };

  const handleDeletePost = async (id: string) => {
    const next = posts.filter((p) => p.id !== id);
    setPosts(next);
    if (selectedPostId === id) {
      setSelectedPostId(next[0]?.id || '');
    }
    await persistPosts(next, { type: 'delete', deleteId: id });
    showToast('게시글이 삭제되었습니다.');
  };

  // Handlers: Lunch Menu Update
  const handleSaveLunchMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLunch || userProfile.role !== 'teacher') return;
    const updated: LunchMenu = {
      ...editingLunch,
      calories: Math.min(5000, Math.max(0, Number(editingLunch.calories) || 800)),
      updatedAt: new Date().toISOString(),
    };
    const next = lunchMenus.map((m) => (m.id === updated.id ? updated : m));
    setLunchMenus(next);
    await persistLunchMenus(next, updated);
    setIsLunchEditModalOpen(false);
    setEditingLunch(null);
    showToast(`${updated.dayLabel} 급식 식단표가 업데이트되었습니다.`);
  };

  // Handlers: Academic Schedule
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile.role !== 'teacher') return;
    if (newScheduleForm.title.trim().length < 2) {
      setFormError('일정 제목을 2자 이상 입력해 주세요.');
      return;
    }
    const now = new Date().toISOString();
    const created: AcademicSchedule = {
      id: `sched_${Date.now()}`,
      date: newScheduleForm.date,
      endDate: newScheduleForm.endDate || undefined,
      title: newScheduleForm.title.trim().slice(0, 100),
      eventType: newScheduleForm.eventType,
      description: newScheduleForm.description.trim().slice(0, 500) || '세부 내용은 학급 공지를 참고하세요.',
      targetGrade: newScheduleForm.targetGrade,
      authorId: userProfile.uid,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...schedules, created];
    setSchedules(next);
    await persistSchedules(next, created);
    setIsScheduleModalOpen(false);
    setNewScheduleForm({
      date: '2026-10-12',
      endDate: '',
      title: '',
      eventType: 'performance',
      description: '',
      targetGrade: 'class2_3',
    });
    showToast('새 학사일정이 등록되었습니다.');
  };

  const handleDeleteSchedule = async (id: string) => {
    if (userProfile.role !== 'teacher') return;
    const next = schedules.filter((s) => s.id !== id);
    setSchedules(next);
    await persistSchedules(next, undefined, id);
    showToast('학사일정이 삭제되었습니다.');
  };

  // Handlers: Private 1:1 Counseling
  const handleCreateCounseling = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const err = validateCounselingInput({
      preferredDate: newCounselingForm.preferredDate,
      message: newCounselingForm.message,
    });
    if (err) {
      setFormError(err);
      return;
    }
    const now = new Date().toISOString();
    const created: CounselingRequest = {
      id: `counsel_${Date.now()}`,
      topic: newCounselingForm.topic,
      preferredDate: newCounselingForm.preferredDate,
      message: newCounselingForm.message.trim(),
      authorId: userProfile.uid,
      authorName:
        userProfile.role === 'student'
          ? newCounselingForm.studentName.trim() || '김민준 (4번)'
          : '김민준 (4번)',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    const next = [created, ...counselingRequests];
    setCounselingRequests(next);
    await persistCounselingRequests(next, { type: 'create', request: created });
    setNewCounselingForm({
      ...newCounselingForm,
      message: '',
    });
    showToast('선생님께 1:1 비공개 상담 신청이 전달되었습니다.');
  };

  const handleTeacherCounselingReply = async (req: CounselingRequest, nextStatus: CounselingStatus) => {
    if (userProfile.role !== 'teacher') return;
    const draftNote = counselingReplyDrafts[req.id]?.trim() || req.teacherNote || '상담 일정을 확인했습니다. 종례 후 교무실 상담석에서 만나요!';
    const updated: CounselingRequest = {
      ...req,
      status: nextStatus,
      teacherNote: draftNote.slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    const next = counselingRequests.map((r) => (r.id === req.id ? updated : r));
    setCounselingRequests(next);
    await persistCounselingRequests(next, { type: 'reply', request: updated });
    showToast(`${req.authorName} 학생의 상담 상태가 업데이트되었습니다.`);
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-6">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('home');
            }}
            className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            해솔반 우리교실
          </a>

          {/* Zone 2: 5 clean text navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveSection('home')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'home'
                  ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              홈 대시보드
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('announcements')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'announcements'
                  ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              학급 안내사항
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('community')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'community'
                  ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              소통 마당
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('lunch')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'lunch'
                  ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              주간 급식메뉴
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('schedule')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'schedule'
                  ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              학사일정·상담
            </button>
          </nav>

          {/* Zone 3: 2 primary actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleGoogleAuth}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              title="클릭하여 담임교사 관리 화면과 학생 화면을 즉시 전환해 볼 수 있습니다"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>
                {userProfile.role === 'teacher' ? '교사 모드 (학생 화면 전환)' : '학생 모드 (교사 화면 전환)'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                if (userProfile.role === 'teacher') {
                  setIsAnnouncementModalOpen(true);
                } else {
                  setIsPostModalOpen(true);
                }
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{userProfile.role === 'teacher' ? '공지·안내 등록' : '소통 글쓰기'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar (visible only on narrow viewports, <= 15% sticky budget) */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {(
          [
            ['home', '홈'],
            ['announcements', '안내사항'],
            ['community', '소통마당'],
            ['lunch', '급식메뉴'],
            ['schedule', '학사·상담'],
          ] as [ActiveSection, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSection(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors ${
              activeSection === key
                ? 'bg-[#1E3A8A] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Transient Feedback Notification */}
      {feedbackBanner && (
        <div className="bg-[#1E3A8A] text-white px-6 py-2.5 text-xs font-medium">
          <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-4">
            <span>{feedbackBanner}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-white/80 hover:text-white whitespace-nowrap shrink-0"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container (1440px Desktop Baseline, 1320px Container) */}
      <main className="flex-1 max-w-[1320px] w-full mx-auto px-6 py-8 space-y-12">
        {/* SECTION 1: HERO & DAILY OVERVIEW (Shown on 'home') */}
        {activeSection === 'home' && (
          <>
            {/* Editorial Classroom Hero Banner */}
            <section className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
              <div className="relative h-[320px] sm:h-[360px] w-full">
                {!heroImgFailed ? (
                  <img
                    src={heroBannerImg}
                    alt="해솔중학교 2학년 3반 따뜻한 아침 교실 풍경"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-900 via-[#1E3A8A] to-slate-800" />
                )}
                {/* Measured Scrim for WCAG AA 4.5:1 Contrast */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-slate-950/20" />

                <div className="absolute inset-0 p-6 sm:p-10 flex flex-col justify-between text-white">
                  {/* Quiet unboxed metadata line */}
                  <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-200">
                    <div className="flex items-center gap-2">
                      <span>해솔중학교 제2학년 3반</span>
                      <span aria-hidden="true">·</span>
                      <span>2026학년도 2학기</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">재적 28명</span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-200">
                      오늘 2026.09.29 (화) · 2학기 중간고사 D-15
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                    <div className="space-y-3 max-w-2xl">
                      <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                        {WEEKLY_CLASSROOM_DUTY.dailyMotto}
                      </h1>
                      <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                        오늘 아침 독서 시간에도 집중해 준 우리 2학년 3반 친구들 고맙습니다.
                        이번 주는 과학 마인드맵 수행평가와 가을 현장체험학습 신청서 마감이 있으니
                        알림장을 꼭 확인하세요.
                      </p>
                    </div>

                    {/* Homeroom Teacher Brief Block */}
                    <div className="bg-slate-950/75 backdrop-blur-md border border-white/15 rounded-xl p-4 flex items-center gap-3.5 shrink-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 shrink-0 border border-white/20">
                        {!avatarImgFailed ? (
                          <img
                            src={teacherAvatarImg}
                            alt="이희주 담임선생님 프로필"
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarImgFailed(true)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                            이희주
                          </div>
                        )}
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white text-sm">
                          이희주 선생님 · 영어과
                        </div>
                        <div className="text-slate-300">
                          본관 3층 제2교무실 · 상담시간 15:40–16:30
                        </div>
                        <div className="text-slate-300 font-mono tabular-nums">
                          이번 주 주번: {WEEKLY_CLASSROOM_DUTY.leaders.join(' / ')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Primary 3-Column Classroom Daily Briefing */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 7 cols: Pinned Notices & Latest Student Communication */}
              <div className="lg:col-span-7 space-y-8">
                {/* Pinned Classroom Notices */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        오늘의 필독 안내 및 알림장
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        선생님이 고정한 중요 공지와 가정통신문 회신 일정을 확인하세요
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('announcements')}
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                    >
                      전체 안내사항 보기 ({announcements.length})
                    </button>
                  </div>

                  <div className="divide-y divide-slate-200/70">
                    {announcements.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="py-4 first:pt-0 last:pb-0 flex flex-col gap-1.5"
                      >
                        {/* Clean unboxed metadata with typographic separators */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-[#1E3A8A]">
                            {CATEGORY_LABELS[item.category]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatKoreanDate(item.createdAt)}
                          </span>
                          {item.isPinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-700 font-medium flex items-center gap-1">
                                <Pin className="w-3 h-3" /> 필독 고정
                              </span>
                            </>
                          )}
                          {item.dueDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-slate-700">
                                마감 {item.dueDate} ({getDdayLabel(item.dueDate)})
                              </span>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedAnnouncement(item)}
                          className="text-left text-base font-semibold text-slate-900 hover:text-[#1E3A8A] transition-colors"
                        >
                          {item.title}
                        </button>
                        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                          {item.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Student-Teacher Communication Preview */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        우리반 소통 마당 최근 이야기
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        수업 질문, 친구 칭찬 릴레이, 학급 건의사항을 자유롭게 나누는 공간입니다
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setIsPostModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        + 새 소통글 쓰기
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSection('community')}
                        className="text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                      >
                        소통 마당 전체보기
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200/70">
                    {posts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="py-4 first:pt-0 last:pb-0 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-800">
                            {TOPIC_LABELS[post.topic]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {post.authorName}
                            {post.studentNumber ? ` (${post.studentNumber}번)` : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatKoreanDate(post.createdAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              post.status === 'answered'
                                ? 'text-emerald-700 font-medium'
                                : 'text-slate-600'
                            }
                          >
                            {POST_STATUS_LABELS[post.status]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            댓글 {post.comments?.length || 0}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPostId(post.id);
                            setActiveSection('community');
                          }}
                          className="text-left text-base font-semibold text-slate-900 hover:text-[#1E3A8A] transition-colors block"
                        >
                          {post.title}
                        </button>
                        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                          {post.body}
                        </p>
                        {post.teacherReply && (
                          <div className="pt-1 text-xs text-slate-700 pl-3 border-l-2 border-[#1E3A8A]">
                            <span className="font-semibold text-[#1E3A8A]">담임선생님 답변: </span>
                            {post.teacherReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right 5 cols: Today's School Lunch + Upcoming Academic Schedule + Weekly Duty */}
              <div className="lg:col-span-5 space-y-8">
                {/* Today's Lunch Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        오늘의 학교 급식 메뉴
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        요일을 선택하면 주간 식단과 알레르기 정보를 볼 수 있습니다
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('lunch')}
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                    >
                      주간 식단표 전체
                    </button>
                  </div>

                  {/* Interactive Day Selector Tabs */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                    {lunchMenus.map((menu) => (
                      <button
                        key={menu.id}
                        type="button"
                        onClick={() => setSelectedLunchId(menu.id)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          activeLunch?.id === menu.id
                            ? 'bg-white text-slate-900 shadow-sm font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {menu.dayLabel.split(' ')[0]}
                      </button>
                    ))}
                  </div>

                  {activeLunch && (
                    <div className="space-y-4">
                      <div className="aspect-4/3 w-full rounded-lg overflow-hidden bg-slate-100 border border-slate-200/60 relative">
                        {!lunchImgFailed ? (
                          <img
                            src={lunchTrayImg}
                            alt={`${activeLunch.dayLabel} 급식 식단 미리보기`}
                            referrerPolicy="no-referrer"
                            onError={() => setLunchImgFailed(true)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                            오늘의 친환경 학교 급식
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent px-4 py-3 text-white flex items-center justify-between text-xs">
                          <span className="font-semibold">
                            {activeLunch.date} · {activeLunch.dayLabel}
                          </span>
                          <span className="font-mono tabular-nums font-semibold">
                            {activeLunch.calories} kcal
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 text-sm">
                        <div className="py-2 flex justify-between gap-4">
                          <span className="text-slate-500">주식 (밥)</span>
                          <span className="font-medium text-slate-900 text-right">
                            {activeLunch.rice}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <span className="text-slate-500">국 · 찌개</span>
                          <span className="font-medium text-slate-900 text-right">
                            {activeLunch.soup}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <span className="text-slate-500">주찬 (메인)</span>
                          <span className="font-semibold text-[#1E3A8A] text-right">
                            {activeLunch.mainDish}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <span className="text-slate-500">부찬 · 김치</span>
                          <span className="font-medium text-slate-900 text-right">
                            {activeLunch.sideDish1} · {activeLunch.sideDish2}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between gap-4">
                          <span className="text-slate-500">후식</span>
                          <span className="font-medium text-slate-900 text-right">
                            {activeLunch.dessert}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">
                        {activeLunch.allergyInfo}
                      </p>
                    </div>
                  )}
                </div>

                {/* Upcoming Academic Schedule List */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        주요 학사일정 및 평가 안내
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        다가오는 수행평가와 학교 주요 행사 일정입니다
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('schedule')}
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                    >
                      학사일정·시간표
                    </button>
                  </div>

                  <div className="divide-y divide-slate-200/70">
                    {schedules.slice(0, 5).map((item) => (
                      <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums font-semibold text-slate-800">
                              {item.date}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{SCHEDULE_TYPE_LABELS[item.eventType]}</span>
                          </div>
                          <span className="font-mono tabular-nums font-semibold text-[#1E3A8A]">
                            {getDdayLabel(item.date)}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </div>
                        <p className="text-xs text-slate-600">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weekly Classroom Cleaning & Duty Info */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-base font-bold text-slate-900">
                      이번 주 학급 주번 및 1인 1역 청소 구역
                    </h2>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      적용 주간: {WEEKLY_CLASSROOM_DUTY.weekRange}
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {WEEKLY_CLASSROOM_DUTY.cleaningZones.map((zone) => (
                      <div key={zone.zone} className="py-2.5 flex justify-between gap-4">
                        <span className="text-slate-600">{zone.zone}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {zone.students}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* SECTION 2: ANNOUNCEMENTS & HOME CORRESPONDENCE (학급 안내사항) */}
        {activeSection === 'announcements' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  해솔중학교 2학년 3반 · 알림장 및 가정통신문 아카이브
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  학급 안내사항 및 가정통신문
                </h1>
              </div>

              {userProfile.role === 'teacher' && (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setIsAnnouncementModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 안내사항 등록</span>
                </button>
              )}
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(
                  [
                    ['all', '전체 보기'],
                    ['notice', '학급 공지'],
                    ['letter', '가정통신문'],
                    ['assignment', '수행·과제'],
                    ['event', '행사 안내'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAnnouncementFilter(key)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      announcementFilter === key
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={announcementSearch}
                  onChange={(e) => setAnnouncementSearch(e.target.value)}
                  placeholder="공지 제목 또는 내용 검색..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            {/* Announcements List Container */}
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200/80">
              {filteredAnnouncements.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    조건에 맞는 학급 안내사항이 없습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAnnouncementFilter('all');
                      setAnnouncementSearch('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-[#1E3A8A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    필터 초기화
                  </button>
                </div>
              ) : (
                filteredAnnouncements.map((item) => (
                  <article key={item.id} className="p-6 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-[#1E3A8A]">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.authorName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          게시일 {formatKoreanDate(item.createdAt)}
                        </span>
                        {item.isPinned && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <Pin className="w-3 h-3" /> 상단 고정 공지
                            </span>
                          </>
                        )}
                        {item.dueDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums font-medium text-slate-800">
                              기한 {item.dueDate} ({getDdayLabel(item.dueDate)})
                            </span>
                          </>
                        )}
                      </div>

                      {userProfile.role === 'teacher' && (
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => handleTogglePinAnnouncement(item)}
                            className="text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0"
                          >
                            {item.isPinned ? '고정 해제' : '상단 고정'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(item.id)}
                            className="text-red-600 hover:text-red-700 whitespace-nowrap shrink-0 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 삭제
                          </button>
                        </div>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-slate-900">
                      {item.title}
                    </h2>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {item.content}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {/* SECTION 3: STUDENT-TEACHER COMMUNICATION BOARD (우리반 소통 마당) */}
        {activeSection === 'community' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  학생과 선생님이 함께 가꾸는 열린 학급 게시판
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  우리반 소통 마당 (질문 · 칭찬 · 건의)
                </h1>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setIsPostModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>새 소통글 작성하기</span>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(
                  [
                    ['all', '전체 글'],
                    ['question', '질문해요'],
                    ['praise', '칭찬 릴레이'],
                    ['suggestion', '학급 건의함'],
                    ['free', '자유 소통'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPostTopicFilter(key)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      postTopicFilter === key
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  placeholder="제목, 내용, 작성자 검색..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            {/* Split View: Post List (5 cols) + Active Post Discussion & Teacher Reply (7 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Post List */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200/80">
                {filteredPosts.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-sm text-slate-600">등록된 게시글이 없습니다.</p>
                  </div>
                ) : (
                  filteredPosts.map((post) => {
                    const isSelected = activePost?.id === post.id;
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => setSelectedPostId(post.id)}
                        className={`w-full text-left p-5 transition-colors block space-y-1.5 ${
                          isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-semibold text-[#1E3A8A]">
                            {TOPIC_LABELS[post.topic]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {post.authorName}
                            {post.studentNumber ? ` (${post.studentNumber}번)` : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              post.status === 'answered'
                                ? 'text-emerald-700 font-semibold'
                                : 'text-slate-500'
                            }
                          >
                            {POST_STATUS_LABELS[post.status]}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 line-clamp-1">
                          {post.title}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {post.body}
                        </p>
                        <div className="text-xs text-slate-400 font-mono tabular-nums pt-0.5">
                          {formatKoreanDate(post.createdAt)} · 댓글 {post.comments?.length || 0}개
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Active Post Detail, Official Teacher Reply & Student Comments */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                {activePost ? (
                  <>
                    <div className="border-b border-slate-200 pb-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#1E3A8A]">
                            {TOPIC_LABELS[activePost.topic]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            작성자: {activePost.authorName}
                            {activePost.studentNumber ? ` (${activePost.studentNumber}번)` : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatKoreanDate(activePost.createdAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              activePost.status === 'answered'
                                ? 'text-emerald-700 font-semibold'
                                : 'text-slate-600'
                            }
                          >
                            {POST_STATUS_LABELS[activePost.status]}
                          </span>
                        </div>

                        {(userProfile.role === 'teacher' ||
                          activePost.authorId === userProfile.uid) && (
                          <button
                            type="button"
                            onClick={() => handleDeletePost(activePost.id)}
                            className="text-red-600 hover:text-red-700 flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 게시글 삭제
                          </button>
                        )}
                      </div>

                      <h2 className="text-xl font-bold text-slate-900">
                        {activePost.title}
                      </h2>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {activePost.body}
                      </p>
                    </div>

                    {/* Official Homeroom Teacher Reply Box */}
                    {activePost.teacherReply ? (
                      <div className="bg-slate-50 border-l-4 border-[#1E3A8A] p-4 rounded-r-lg space-y-1.5">
                        <div className="text-xs font-semibold text-[#1E3A8A] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>이희주 담임선생님 공식 답변</span>
                        </div>
                        <p className="text-sm text-slate-800 leading-relaxed">
                          {activePost.teacherReply}
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        아직 담임선생님의 공식 답변이 등록되지 않았습니다.
                      </div>
                    )}

                    {/* Teacher Reply Editor (visible in Teacher Mode) */}
                    {userProfile.role === 'teacher' && (
                      <form onSubmit={handleSaveTeacherReply} className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="block text-xs font-semibold text-slate-700">
                          담임교사 공식 답변 작성 / 수정
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={teacherReplyInput}
                            onChange={(e) => setTeacherReplyInput(e.target.value)}
                            placeholder="학생의 질문이나 건의사항에 따뜻한 답변을 남겨주세요..."
                            className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#1E3A8A]"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            답변 저장
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Student & Teacher Comments Section */}
                    <div className="space-y-4 pt-2 border-t border-slate-200">
                      <div className="text-sm font-bold text-slate-900">
                        학급 친구들의 댓글 ({activePost.comments?.length || 0})
                      </div>

                      <div className="divide-y divide-slate-100">
                        {(activePost.comments || []).length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            첫 번째 응원이나 의견 댓글을 남겨 보세요!
                          </p>
                        ) : (
                          activePost.comments.map((c) => (
                            <div key={c.id} className="py-3 space-y-1">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-semibold text-slate-800">
                                  {c.authorName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {formatKoreanDate(c.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-700">{c.content}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                        <input
                          type="text"
                          value={commentInput}
                          onChange={(e) => setCommentInput(e.target.value)}
                          placeholder={`${userProfile.name} 이름으로 댓글 남기기...`}
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>댓글 등록</span>
                        </button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">
                    왼쪽 목록에서 게시글을 선택해 주세요.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 4: WEEKLY SCHOOL LUNCH MENU (주간 급식메뉴) */}
        {activeSection === 'lunch' && (
          <section className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  해솔중학교 영양교사실 · 친환경 식재료 및 알레르기 유발 식품 안내
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  이번 주 학교 급식 메뉴 및 영양 정보
                </h1>
              </div>

              {userProfile.role === 'teacher' && activeLunch && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLunch({ ...activeLunch });
                    setIsLunchEditModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>선택 요일({activeLunch.dayLabel.split(' ')[0]}) 식단 수정</span>
                </button>
              )}
            </div>

            {/* Weekly Full Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3.5 px-4">요일 · 일자</th>
                      <th className="py-3.5 px-4">주식 (밥)</th>
                      <th className="py-3.5 px-4">국 · 찌개</th>
                      <th className="py-3.5 px-4">주찬 (메인 메뉴)</th>
                      <th className="py-3.5 px-4">부찬 · 김치</th>
                      <th className="py-3.5 px-4">후식</th>
                      <th className="py-3.5 px-4 text-right">열량 (kcal)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 text-sm">
                    {lunchMenus.map((menu) => {
                      const isSelected = activeLunch?.id === menu.id;
                      return (
                        <tr
                          key={menu.id}
                          onClick={() => setSelectedLunchId(menu.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {menu.dayLabel}
                            </div>
                            <div className="text-xs text-slate-500 font-mono tabular-nums">
                              {menu.date}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-800">{menu.rice}</td>
                          <td className="py-3.5 px-4 text-slate-800">{menu.soup}</td>
                          <td className="py-3.5 px-4 font-semibold text-[#1E3A8A]">
                            {menu.mainDish}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {menu.sideDish1} · {menu.sideDish2}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">{menu.dessert}</td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {menu.calories} kcal
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Allergy Guide & Nutrition Note */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <h2 className="text-sm font-bold text-slate-900">
                학교급식 알레르기 유발식품 표시 번호 안내 (교육부 기준 1~19번)
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed font-mono tabular-nums">
                1.난류 · 2.우유 · 3.메밀 · 4.땅콩 · 5.대두 · 6.밀 · 7.고등어 · 8.게 · 9.새우 · 10.돼지고기 · 11.복숭아 · 12.토마토 · 13.아황산류 · 14.호두 · 15.닭고기 · 16.쇠고기 · 17.오징어 · 18.조개류(굴·전복·홍합 포함) · 19.잣
              </p>
              <p className="text-xs text-slate-500">
                특정 식품 알레르기가 있는 학생은 배식 전 담임선생님과 영양선생님께 반드시 미리 알려 대체식을 안내받으세요.
              </p>
            </div>
          </section>
        )}

        {/* SECTION 5: ACADEMIC CALENDAR, TIMETABLE & 1:1 PRIVATE COUNSELING (학사일정·상담) */}
        {activeSection === 'schedule' && (
          <section className="space-y-12">
            {/* Part A: Academic Schedule */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
                <div>
                  <div className="text-xs text-slate-500 mb-1">
                    2026학년도 2학기 지필·수행평가 및 학교 행사 일정
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                    우리반 학사일정 및 주간 시간표
                  </h1>
                </div>

                {userProfile.role === 'teacher' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setIsScheduleModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>학사일정 추가</span>
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
                {(
                  [
                    ['all', '전체 일정'],
                    ['exam', '지필평가'],
                    ['performance', '수행평가'],
                    ['activity', '체험·행사'],
                    ['holiday', '공휴일'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScheduleTypeFilter(key)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      scheduleTypeFilter === key
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200/80">
                {filteredSchedules.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {item.date}
                          {item.endDate ? ` ~ ${item.endDate}` : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#1E3A8A]">
                          {SCHEDULE_TYPE_LABELS[item.eventType]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-semibold text-amber-700">
                          {getDdayLabel(item.date)}
                        </span>
                      </div>
                      <div className="text-base font-bold text-slate-900">
                        {item.title}
                      </div>
                      <p className="text-xs text-slate-600">{item.description}</p>
                    </div>

                    {userProfile.role === 'teacher' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(item.id)}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 whitespace-nowrap shrink-0 self-start sm:self-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 일정 삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Part B: 2학년 3반 주간 시간표 */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  2학년 3반 정규 주간 시간표
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  과학실, 음악실, 미술실, 메이커실 이동수업 교시는 수업 시작 5분 전까지 이동을 마쳐 주세요
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">교시 · 시간</th>
                        <th className="py-3 px-4">월요일</th>
                        <th className="py-3 px-4">화요일</th>
                        <th className="py-3 px-4">수요일</th>
                        <th className="py-3 px-4">목요일</th>
                        <th className="py-3 px-4">금요일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 text-sm">
                      {CLASSROOM_TIMETABLE.map((row) => (
                        <tr key={row.period} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-900 font-mono tabular-nums">
                              {row.period}교시
                            </span>
                            <span className="text-xs text-slate-500 font-mono tabular-nums ml-2">
                              {row.timeRange}
                            </span>
                          </td>
                          {(['mon', 'tue', 'wed', 'thu', 'fri'] as const).map((dayKey) => {
                            const cell = row[dayKey];
                            return (
                              <td key={dayKey} className="py-3 px-4">
                                <div className="font-semibold text-slate-900">
                                  {cell.subject}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {cell.teacher}
                                  {cell.room ? ` · ${cell.room}` : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Part C: 1:1 Private Teacher-Student Counseling Box (선생님께 1:1 비공개 상담실) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-4 border-t border-slate-200">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A8A]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>철저한 비밀 보장 · 담임교사 1:1 전용</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    선생님께 1:1 비공개 상담 신청
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    학업, 교우관계, 진로 고민 등 공개 게시판에 쓰기 어려운 이야기를 남겨 주세요.
                    작성한 글은 본인과 담임선생님만 열람할 수 있습니다.
                  </p>
                </div>

                <form onSubmit={handleCreateCounseling} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      신청 학생 이름 (번호)
                    </label>
                    <input
                      type="text"
                      value={newCounselingForm.studentName}
                      onChange={(e) =>
                        setNewCounselingForm({
                          ...newCounselingForm,
                          studentName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        상담 주제
                      </label>
                      <select
                        value={newCounselingForm.topic}
                        onChange={(e) =>
                          setNewCounselingForm({
                            ...newCounselingForm,
                            topic: e.target.value as CounselingTopic,
                          })
                        }
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                      >
                        <option value="study">학업·성적 고민</option>
                        <option value="friendship">교우관계</option>
                        <option value="career">진로·진학</option>
                        <option value="health">건강·생활</option>
                        <option value="other">기타 이야기</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        희망 상담일
                      </label>
                      <input
                        type="date"
                        value={newCounselingForm.preferredDate}
                        onChange={(e) =>
                          setNewCounselingForm({
                            ...newCounselingForm,
                            preferredDate: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono tabular-nums focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      선생님께 전하고 싶은 이야기
                    </label>
                    <textarea
                      rows={3}
                      value={newCounselingForm.message}
                      onChange={(e) =>
                        setNewCounselingForm({
                          ...newCounselingForm,
                          message: e.target.value,
                        })
                      }
                      placeholder="고민 내용이나 상담받고 싶은 내용을 편하게 적어 주세요..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>

                  {formError && (
                    <p className="text-xs text-red-600 font-medium">{formError}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors"
                  >
                    1:1 비공개 상담 신청하기
                  </button>
                </form>
              </div>

              {/* Right 7 cols: Private Counseling History (Filtered by Role) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {userProfile.role === 'teacher'
                        ? '담임교사 전용 · 전체 학생 1:1 상담 신청함'
                        : `${userProfile.name} 학생의 비공개 상담 내역`}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {userProfile.role === 'teacher'
                        ? '교사 모드에서는 우리 반 학생들이 신청한 모든 비공개 상담에 답장하고 일정을 확정할 수 있습니다.'
                        : '학생 모드에서는 본인이 신청한 비공개 상담 내역만 표시됩니다 (다른 학생의 상담은 철저히 비공개).'}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-200/80">
                  {visibleCounselingRequests.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      신청된 상담 내역이 없습니다.
                    </div>
                  ) : (
                    visibleCounselingRequests.map((req) => (
                      <div key={req.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-[#1E3A8A]">
                            {COUNSELING_TOPIC_LABELS[req.topic]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-slate-800">
                            {req.authorName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            희망일 {req.preferredDate}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              req.status === 'scheduled' || req.status === 'completed'
                                ? 'text-emerald-700 font-semibold'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            {COUNSELING_STATUS_LABELS[req.status]}
                          </span>
                        </div>

                        <p className="text-sm text-slate-800 leading-relaxed">
                          {req.message}
                        </p>

                        {req.teacherNote && (
                          <div className="bg-slate-50 border-l-4 border-[#1E3A8A] p-3 rounded-r-lg text-xs text-slate-700">
                            <span className="font-semibold text-[#1E3A8A]">
                              선생님 답장:{' '}
                            </span>
                            {req.teacherNote}
                          </div>
                        )}

                        {userProfile.role === 'teacher' && (
                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <input
                              type="text"
                              value={counselingReplyDrafts[req.id] ?? req.teacherNote ?? ''}
                              onChange={(e) =>
                                setCounselingReplyDrafts({
                                  ...counselingReplyDrafts,
                                  [req.id]: e.target.value,
                                })
                              }
                              placeholder="학생에게 전달할 상담 시간 및 안내 메모 입력..."
                              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#1E3A8A]"
                            />
                            <button
                              type="button"
                              onClick={() => handleTeacherCounselingReply(req, 'scheduled')}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172E6E] rounded-lg transition-colors whitespace-nowrap shrink-0"
                            >
                              일정 확정 및 답장
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* MODAL 1: Announcement Detail Reader */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-[#1E3A8A]">
                  {CATEGORY_LABELS[selectedAnnouncement.category]}
                </span>
                {' · '}
                <span className="font-mono tabular-nums">
                  {formatKoreanDate(selectedAnnouncement.createdAt)}
                </span>
                {' · '}
                <span>{selectedAnnouncement.authorName}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {selectedAnnouncement.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {selectedAnnouncement.content}
            </p>
            {selectedAnnouncement.dueDate && (
              <div className="text-xs font-mono tabular-nums text-slate-600 pt-2 border-t border-slate-100">
                제출·해당 기한: {selectedAnnouncement.dueDate} ({getDdayLabel(selectedAnnouncement.dueDate)})
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New Announcement (Teacher) */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                새 학급 안내사항 · 가정통신문 등록
              </h3>
              <button
                type="button"
                onClick={() => setIsAnnouncementModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    분류
                  </label>
                  <select
                    value={newAnnouncementForm.category}
                    onChange={(e) =>
                      setNewAnnouncementForm({
                        ...newAnnouncementForm,
                        category: e.target.value as AnnouncementCategory,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="notice">학급 공지</option>
                    <option value="letter">가정통신문</option>
                    <option value="assignment">수행·과제 안내</option>
                    <option value="event">학급 행사</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    마감일 / 시행일 (선택)
                  </label>
                  <input
                    type="date"
                    value={newAnnouncementForm.dueDate}
                    onChange={(e) =>
                      setNewAnnouncementForm({
                        ...newAnnouncementForm,
                        dueDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  안내 제목
                </label>
                <input
                  type="text"
                  required
                  value={newAnnouncementForm.title}
                  onChange={(e) =>
                    setNewAnnouncementForm({
                      ...newAnnouncementForm,
                      title: e.target.value,
                    })
                  }
                  placeholder="예: 금요일 6교시 학급회의 안건 안내"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  상세 안내 내용
                </label>
                <textarea
                  rows={4}
                  required
                  value={newAnnouncementForm.content}
                  onChange={(e) =>
                    setNewAnnouncementForm({
                      ...newAnnouncementForm,
                      content: e.target.value,
                    })
                  }
                  placeholder="학생들과 학부모님께 전달할 상세 내용을 입력해 주세요..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAnnouncementForm.isPinned}
                  onChange={(e) =>
                    setNewAnnouncementForm({
                      ...newAnnouncementForm,
                      isPinned: e.target.checked,
                    })
                  }
                />
                <span>홈 대시보드 필독 알림장 상단에 고정하기</span>
              </label>

              {formError && (
                <p className="text-xs text-red-600 font-medium">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg"
                >
                  안내사항 게시하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create New Student/Teacher Community Post */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                우리반 소통 마당 새 글 쓰기
              </h3>
              <button
                type="button"
                onClick={() => setIsPostModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    말머리 주제
                  </label>
                  <select
                    value={newPostForm.topic}
                    onChange={(e) =>
                      setNewPostForm({
                        ...newPostForm,
                        topic: e.target.value as PostTopic,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="question">질문해요</option>
                    <option value="praise">칭찬 릴레이</option>
                    <option value="suggestion">학급 건의함</option>
                    <option value="free">자유 소통</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    작성자 이름
                  </label>
                  <input
                    type="text"
                    value={newPostForm.authorName}
                    onChange={(e) =>
                      setNewPostForm({
                        ...newPostForm,
                        authorName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    출석번호 (숫자)
                  </label>
                  <input
                    type="text"
                    value={newPostForm.studentNumber}
                    onChange={(e) =>
                      setNewPostForm({
                        ...newPostForm,
                        studentNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  제목
                </label>
                <input
                  type="text"
                  required
                  value={newPostForm.title}
                  onChange={(e) =>
                    setNewPostForm({
                      ...newPostForm,
                      title: e.target.value,
                    })
                  }
                  placeholder="친구들이나 선생님께 나누고 싶은 제목을 적어주세요"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  본문 내용
                </label>
                <textarea
                  rows={4}
                  required
                  value={newPostForm.body}
                  onChange={(e) =>
                    setNewPostForm({
                      ...newPostForm,
                      body: e.target.value,
                    })
                  }
                  placeholder="배려하고 존중하는 고운 말로 내용을 작성해 주세요..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600 font-medium">{formError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg"
                >
                  게시글 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Edit Lunch Menu (Teacher) */}
      {isLunchEditModalOpen && editingLunch && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingLunch.dayLabel} ({editingLunch.date}) 급식 메뉴 수정
              </h3>
              <button
                type="button"
                onClick={() => setIsLunchEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLunchMenu} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    주식 (밥)
                  </label>
                  <input
                    type="text"
                    value={editingLunch.rice}
                    onChange={(e) =>
                      setEditingLunch({ ...editingLunch, rice: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    국 · 찌개
                  </label>
                  <input
                    type="text"
                    value={editingLunch.soup}
                    onChange={(e) =>
                      setEditingLunch({ ...editingLunch, soup: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  주찬 (메인 요리)
                </label>
                <input
                  type="text"
                  value={editingLunch.mainDish}
                  onChange={(e) =>
                    setEditingLunch({ ...editingLunch, mainDish: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    부찬 1
                  </label>
                  <input
                    type="text"
                    value={editingLunch.sideDish1}
                    onChange={(e) =>
                      setEditingLunch({ ...editingLunch, sideDish1: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    부찬 2 (김치 등)
                  </label>
                  <input
                    type="text"
                    value={editingLunch.sideDish2}
                    onChange={(e) =>
                      setEditingLunch({ ...editingLunch, sideDish2: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    후식
                  </label>
                  <input
                    type="text"
                    value={editingLunch.dessert}
                    onChange={(e) =>
                      setEditingLunch({ ...editingLunch, dessert: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    열량 (kcal)
                  </label>
                  <input
                    type="number"
                    value={editingLunch.calories}
                    onChange={(e) =>
                      setEditingLunch({
                        ...editingLunch,
                        calories: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLunchEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg"
                >
                  식단 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Create Academic Schedule (Teacher) */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                새 학사일정 · 평가 일정 등록
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={newScheduleForm.date}
                    onChange={(e) =>
                      setNewScheduleForm({
                        ...newScheduleForm,
                        date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    일정 구분
                  </label>
                  <select
                    value={newScheduleForm.eventType}
                    onChange={(e) =>
                      setNewScheduleForm({
                        ...newScheduleForm,
                        eventType: e.target.value as ScheduleEventType,
                      })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  >
                    <option value="performance">수행평가</option>
                    <option value="exam">지필평가</option>
                    <option value="activity">체험·행사</option>
                    <option value="holiday">공휴일·휴업</option>
                    <option value="school">학교일정</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  일정 제목
                </label>
                <input
                  type="text"
                  required
                  value={newScheduleForm.title}
                  onChange={(e) =>
                    setNewScheduleForm({
                      ...newScheduleForm,
                      title: e.target.value,
                    })
                  }
                  placeholder="예: 영어 듣기평가 (1교시)"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  준비물 및 세부 안내
                </label>
                <textarea
                  rows={3}
                  value={newScheduleForm.description}
                  onChange={(e) =>
                    setNewScheduleForm({
                      ...newScheduleForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="컴퓨터용 사인펜 지참, 방송시간 08:50 시작 등..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg"
                >
                  일정 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-6 mt-12">
        <div className="max-w-[1320px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            해솔중학교 제2학년 3반 학급 홈페이지 · 담임교사 이희주 (제2교무실)
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('announcements')}
              className="hover:text-slate-900"
            >
              가정통신문
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveSection('community')}
              className="hover:text-slate-900"
            >
              소통 마당
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveSection('schedule')}
              className="hover:text-slate-900"
            >
              1:1 상담실
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
