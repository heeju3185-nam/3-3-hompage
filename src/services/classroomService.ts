import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isLiveFirebaseConfig,
  OperationType,
} from '../firebase';
import {
  INITIAL_ANNOUNCEMENTS,
  INITIAL_COUNSELING_REQUESTS,
  INITIAL_LUNCH_MENUS,
  INITIAL_POSTS,
  INITIAL_SCHEDULES,
} from '../data/initialClassroomData';
import {
  AcademicSchedule,
  Announcement,
  BLUEPRINT_CONSTRAINTS,
  CommunityPost,
  CounselingRequest,
  LunchMenu,
  PostComment,
} from '../types/classroom';

const STORAGE_KEYS = {
  announcements: 'haesol_class_announcements_v1',
  posts: 'haesol_class_posts_v1',
  lunchMenus: 'haesol_class_lunch_v1',
  schedules: 'haesol_class_schedules_v1',
  counseling: 'haesol_class_counseling_v1',
};

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function loadLocalData<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLocalData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in sandboxed frames
  }
}

export function validateAnnouncementInput(input: {
  title: string;
  content: string;
  dueDate?: string;
}): string | null {
  const title = input.title.trim();
  const content = input.content.trim();
  if (
    title.length < BLUEPRINT_CONSTRAINTS.announcement.titleMin ||
    title.length > BLUEPRINT_CONSTRAINTS.announcement.titleMax
  ) {
    return `제목은 ${BLUEPRINT_CONSTRAINTS.announcement.titleMin}자 이상 ${BLUEPRINT_CONSTRAINTS.announcement.titleMax}자 이하로 입력해 주세요.`;
  }
  if (
    content.length < BLUEPRINT_CONSTRAINTS.announcement.contentMin ||
    content.length > BLUEPRINT_CONSTRAINTS.announcement.contentMax
  ) {
    return `본문은 ${BLUEPRINT_CONSTRAINTS.announcement.contentMin}자 이상 ${BLUEPRINT_CONSTRAINTS.announcement.contentMax}자 이하로 입력해 주세요.`;
  }
  if (input.dueDate && !BLUEPRINT_CONSTRAINTS.dateRegex.test(input.dueDate)) {
    return '마감일은 YYYY-MM-DD 형식이어야 합니다.';
  }
  return null;
}

export function validatePostInput(input: {
  title: string;
  body: string;
  studentNumber?: string;
}): string | null {
  const title = input.title.trim();
  const body = input.body.trim();
  if (
    title.length < BLUEPRINT_CONSTRAINTS.post.titleMin ||
    title.length > BLUEPRINT_CONSTRAINTS.post.titleMax
  ) {
    return `제목은 ${BLUEPRINT_CONSTRAINTS.post.titleMin}자 이상 ${BLUEPRINT_CONSTRAINTS.post.titleMax}자 이하로 입력해 주세요.`;
  }
  if (
    body.length < BLUEPRINT_CONSTRAINTS.post.bodyMin ||
    body.length > BLUEPRINT_CONSTRAINTS.post.bodyMax
  ) {
    return `내용은 ${BLUEPRINT_CONSTRAINTS.post.bodyMin}자 이상 ${BLUEPRINT_CONSTRAINTS.post.bodyMax}자 이하로 입력해 주세요.`;
  }
  if (
    input.studentNumber &&
    input.studentNumber.trim() !== '' &&
    !BLUEPRINT_CONSTRAINTS.studentNumberRegex.test(input.studentNumber.trim())
  ) {
    return '출석번호는 숫자만 입력해 주세요 (예: 4).';
  }
  return null;
}

export function validateCounselingInput(input: {
  preferredDate: string;
  message: string;
}): string | null {
  if (!BLUEPRINT_CONSTRAINTS.dateRegex.test(input.preferredDate)) {
    return '희망 상담일을 올바르게 선택해 주세요.';
  }
  const msg = input.message.trim();
  if (
    msg.length < BLUEPRINT_CONSTRAINTS.counseling.messageMin ||
    msg.length > BLUEPRINT_CONSTRAINTS.counseling.messageMax
  ) {
    return `상담 신청 내용은 ${BLUEPRINT_CONSTRAINTS.counseling.messageMin}자 이상 ${BLUEPRINT_CONSTRAINTS.counseling.messageMax}자 이하로 작성해 주세요.`;
  }
  return null;
}

export function getInitialClassroomState() {
  return {
    announcements: loadLocalData<Announcement[]>(
      STORAGE_KEYS.announcements,
      INITIAL_ANNOUNCEMENTS
    ),
    posts: loadLocalData<CommunityPost[]>(STORAGE_KEYS.posts, INITIAL_POSTS),
    lunchMenus: loadLocalData<LunchMenu[]>(
      STORAGE_KEYS.lunchMenus,
      INITIAL_LUNCH_MENUS
    ),
    schedules: loadLocalData<AcademicSchedule[]>(
      STORAGE_KEYS.schedules,
      INITIAL_SCHEDULES
    ),
    counselingRequests: loadLocalData<CounselingRequest[]>(
      STORAGE_KEYS.counseling,
      INITIAL_COUNSELING_REQUESTS
    ),
  };
}

export function subscribeLiveFirestoreCollections(callbacks: {
  onAnnouncements: (items: Announcement[]) => void;
  onPosts: (items: CommunityPost[]) => void;
  onLunchMenus: (items: LunchMenu[]) => void;
  onSchedules: (items: AcademicSchedule[]) => void;
  onCounseling: (items: CounselingRequest[]) => void;
}): () => void {
  if (!isLiveFirebaseConfig || !auth.currentUser) {
    return () => {};
  }

  const unsubs: Array<() => void> = [];

  const announcementsPath = 'announcements';
  const announcementsQuery = query(
    collection(db, announcementsPath),
    where('category', 'in', ['notice', 'letter', 'assignment', 'event'])
  );
  unsubs.push(
    onSnapshot(
      announcementsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as Announcement
          );
          callbacks.onAnnouncements(items);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, announcementsPath);
      }
    )
  );

  const postsPath = 'posts';
  const postsQuery = query(
    collection(db, postsPath),
    where('topic', 'in', ['question', 'praise', 'suggestion', 'free'])
  );
  unsubs.push(
    onSnapshot(
      postsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map((d) => ({
            id: d.id,
            comments: [],
            ...d.data(),
          }) as unknown as CommunityPost);
          callbacks.onPosts(items);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, postsPath);
      }
    )
  );

  const lunchPath = 'lunchMenus';
  const lunchQuery = query(
    collection(db, lunchPath),
    where('calories', '>=', 0)
  );
  unsubs.push(
    onSnapshot(
      lunchQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as LunchMenu
          );
          callbacks.onLunchMenus(items);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, lunchPath);
      }
    )
  );

  const schedulesPath = 'schedules';
  const schedulesQuery = query(
    collection(db, schedulesPath),
    where('targetGrade', 'in', ['all', 'grade2', 'class2_3'])
  );
  unsubs.push(
    onSnapshot(
      schedulesQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as AcademicSchedule
          );
          callbacks.onSchedules(items);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, schedulesPath);
      }
    )
  );

  const counselingPath = 'counselingRequests';
  const counselingQuery = query(
    collection(db, counselingPath),
    where('authorId', '==', auth.currentUser.uid)
  );
  unsubs.push(
    onSnapshot(
      counselingQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as CounselingRequest
          );
          callbacks.onCounseling(items);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, counselingPath);
      }
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function persistAnnouncements(items: Announcement[], newOrUpdated?: Announcement, isDeleteId?: string): Promise<void> {
  saveLocalData(STORAGE_KEYS.announcements, items);
  if (!isLiveFirebaseConfig || !auth.currentUser) return;

  const path = 'announcements';
  try {
    if (isDeleteId) {
      await deleteDoc(doc(db, path, sanitizeId(isDeleteId)));
    } else if (newOrUpdated) {
      const docId = sanitizeId(newOrUpdated.id);
      const payload: Record<string, unknown> = {
        title: newOrUpdated.title.slice(0, BLUEPRINT_CONSTRAINTS.announcement.titleMax),
        category: newOrUpdated.category,
        content: newOrUpdated.content.slice(0, BLUEPRINT_CONSTRAINTS.announcement.contentMax),
        isPinned: newOrUpdated.isPinned,
        authorId: auth.currentUser.uid,
        authorName: newOrUpdated.authorName.slice(0, BLUEPRINT_CONSTRAINTS.announcement.authorNameMax),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (newOrUpdated.dueDate && BLUEPRINT_CONSTRAINTS.dateRegex.test(newOrUpdated.dueDate)) {
        payload.dueDate = newOrUpdated.dueDate;
      }
      await setDoc(doc(db, path, docId), payload);
    }
  } catch (error) {
    handleFirestoreError(error, isDeleteId ? OperationType.DELETE : OperationType.WRITE, path);
  }
}

export async function persistPosts(
  items: CommunityPost[],
  action?: {
    type: 'create' | 'reply' | 'delete' | 'comment';
    post?: CommunityPost;
    comment?: PostComment;
    deleteId?: string;
  }
): Promise<void> {
  saveLocalData(STORAGE_KEYS.posts, items);
  if (!isLiveFirebaseConfig || !auth.currentUser || !action) return;

  const path = 'posts';
  try {
    if (action.type === 'delete' && action.deleteId) {
      await deleteDoc(doc(db, path, sanitizeId(action.deleteId)));
    } else if (action.type === 'create' && action.post) {
      const docId = sanitizeId(action.post.id);
      const payload: Record<string, unknown> = {
        topic: action.post.topic,
        title: action.post.title.slice(0, BLUEPRINT_CONSTRAINTS.post.titleMax),
        body: action.post.body.slice(0, BLUEPRINT_CONSTRAINTS.post.bodyMax),
        authorId: auth.currentUser.uid,
        authorName: action.post.authorName.slice(0, 40),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (
        action.post.studentNumber &&
        BLUEPRINT_CONSTRAINTS.studentNumberRegex.test(action.post.studentNumber)
      ) {
        payload.studentNumber = action.post.studentNumber;
      }
      await setDoc(doc(db, path, docId), payload);
    } else if (action.type === 'reply' && action.post) {
      const docId = sanitizeId(action.post.id);
      await updateDoc(doc(db, path, docId), {
        status: action.post.status,
        teacherReply: action.post.teacherReply?.slice(0, BLUEPRINT_CONSTRAINTS.post.teacherReplyMax),
        updatedAt: serverTimestamp(),
      });
    } else if (action.type === 'comment' && action.post && action.comment) {
      const postId = sanitizeId(action.post.id);
      const commentId = sanitizeId(action.comment.id);
      const commentPath = `posts/${postId}/comments`;
      await setDoc(doc(db, commentPath, commentId), {
        postId,
        content: action.comment.content.slice(0, BLUEPRINT_CONSTRAINTS.post.commentMax),
        authorId: auth.currentUser.uid,
        authorName: action.comment.authorName.slice(0, 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistLunchMenus(items: LunchMenu[], updatedMenu?: LunchMenu): Promise<void> {
  saveLocalData(STORAGE_KEYS.lunchMenus, items);
  if (!isLiveFirebaseConfig || !auth.currentUser || !updatedMenu) return;

  const path = 'lunchMenus';
  try {
    const docId = sanitizeId(updatedMenu.id);
    await setDoc(doc(db, path, docId), {
      date: updatedMenu.date,
      dayLabel: updatedMenu.dayLabel.slice(0, 20),
      rice: updatedMenu.rice.slice(0, 60),
      soup: updatedMenu.soup.slice(0, 60),
      mainDish: updatedMenu.mainDish.slice(0, 80),
      sideDish1: updatedMenu.sideDish1.slice(0, 80),
      sideDish2: updatedMenu.sideDish2.slice(0, 80),
      dessert: updatedMenu.dessert.slice(0, 60),
      calories: Math.min(5000, Math.max(0, Number(updatedMenu.calories) || 800)),
      allergyInfo: updatedMenu.allergyInfo.slice(0, 120),
      authorId: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistSchedules(
  items: AcademicSchedule[],
  newSchedule?: AcademicSchedule,
  deleteId?: string
): Promise<void> {
  saveLocalData(STORAGE_KEYS.schedules, items);
  if (!isLiveFirebaseConfig || !auth.currentUser) return;

  const path = 'schedules';
  try {
    if (deleteId) {
      await deleteDoc(doc(db, path, sanitizeId(deleteId)));
    } else if (newSchedule) {
      const docId = sanitizeId(newSchedule.id);
      const payload: Record<string, unknown> = {
        date: newSchedule.date,
        title: newSchedule.title.slice(0, BLUEPRINT_CONSTRAINTS.schedule.titleMax),
        eventType: newSchedule.eventType,
        description: newSchedule.description.slice(0, BLUEPRINT_CONSTRAINTS.schedule.descriptionMax),
        targetGrade: newSchedule.targetGrade,
        authorId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (newSchedule.endDate && BLUEPRINT_CONSTRAINTS.dateRegex.test(newSchedule.endDate)) {
        payload.endDate = newSchedule.endDate;
      }
      await setDoc(doc(db, path, docId), payload);
    }
  } catch (error) {
    handleFirestoreError(error, deleteId ? OperationType.DELETE : OperationType.WRITE, path);
  }
}

export async function persistCounselingRequests(
  items: CounselingRequest[],
  action?: {
    type: 'create' | 'reply';
    request: CounselingRequest;
  }
): Promise<void> {
  saveLocalData(STORAGE_KEYS.counseling, items);
  if (!isLiveFirebaseConfig || !auth.currentUser || !action) return;

  const path = 'counselingRequests';
  try {
    const docId = sanitizeId(action.request.id);
    if (action.type === 'create') {
      await setDoc(doc(db, path, docId), {
        topic: action.request.topic,
        preferredDate: action.request.preferredDate,
        message: action.request.message.slice(0, BLUEPRINT_CONSTRAINTS.counseling.messageMax),
        authorId: auth.currentUser.uid,
        authorName: action.request.authorName.slice(0, 40),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (action.type === 'reply') {
      await updateDoc(doc(db, path, docId), {
        status: action.request.status,
        teacherNote: action.request.teacherNote?.slice(0, BLUEPRINT_CONSTRAINTS.counseling.teacherNoteMax),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
