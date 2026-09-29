export type AnnouncementCategory = 'notice' | 'letter' | 'assignment' | 'event';

export interface Announcement {
  id: string;
  title: string;
  category: AnnouncementCategory;
  content: string;
  isPinned: boolean;
  dueDate?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export type PostTopic = 'question' | 'praise' | 'suggestion' | 'free';
export type PostStatus = 'open' | 'answered' | 'archived';

export interface PostComment {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPost {
  id: string;
  topic: PostTopic;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  studentNumber?: string;
  status: PostStatus;
  teacherReply?: string;
  createdAt: string;
  updatedAt: string;
  comments: PostComment[];
}

export interface LunchMenu {
  id: string;
  date: string;
  dayLabel: string;
  rice: string;
  soup: string;
  mainDish: string;
  sideDish1: string;
  sideDish2: string;
  dessert: string;
  calories: number;
  allergyInfo: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleEventType = 'exam' | 'performance' | 'activity' | 'holiday' | 'school';
export type TargetGradeScope = 'all' | 'grade2' | 'class2_3';

export interface AcademicSchedule {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  eventType: ScheduleEventType;
  description: string;
  targetGrade: TargetGradeScope;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export type CounselingTopic = 'study' | 'friendship' | 'career' | 'health' | 'other';
export type CounselingStatus = 'pending' | 'scheduled' | 'completed';

export interface CounselingRequest {
  id: string;
  topic: CounselingTopic;
  preferredDate: string;
  message: string;
  authorId: string;
  authorName: string;
  status: CounselingStatus;
  teacherNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimetablePeriod {
  period: number;
  timeRange: string;
  mon: { subject: string; teacher: string; room?: string };
  tue: { subject: string; teacher: string; room?: string };
  wed: { subject: string; teacher: string; room?: string };
  thu: { subject: string; teacher: string; room?: string };
  fri: { subject: string; teacher: string; room?: string };
}

export interface ClassroomDuty {
  weekRange: string;
  leaders: string[];
  cleaningZones: { zone: string; students: string }[];
  dailyMotto: string;
}

export interface UserSessionProfile {
  uid: string;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  studentNumber?: string;
}

// Validation Constraints synchronized verbatim with firebase-blueprint.json
export const BLUEPRINT_CONSTRAINTS = {
  idRegex: /^[a-zA-Z0-9_-]+$/,
  dateRegex: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  studentNumberRegex: /^[0-9]{1,5}$/,
  announcement: {
    titleMin: 2,
    titleMax: 120,
    contentMin: 2,
    contentMax: 2000,
    authorNameMax: 40,
  },
  post: {
    titleMin: 2,
    titleMax: 100,
    bodyMin: 2,
    bodyMax: 1500,
    teacherReplyMax: 1000,
    commentMax: 500,
  },
  lunch: {
    itemMax: 80,
    allergyMax: 120,
    caloriesMax: 5000,
  },
  schedule: {
    titleMin: 2,
    titleMax: 100,
    descriptionMax: 500,
  },
  counseling: {
    messageMin: 2,
    messageMax: 1000,
    teacherNoteMax: 500,
  },
} as const;
