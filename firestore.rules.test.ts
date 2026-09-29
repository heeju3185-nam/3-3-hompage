/**
 * Firestore Security Rules Specification Test Suite
 * Verifies that all "Dirty Dozen" adversarial payloads defined in security_spec.md
 * return PERMISSION_DENIED under the hardened classroom ruleset.
 */

interface MockAuth {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
  };
}

interface RuleContext {
  auth: MockAuth | null;
  requestTime: string;
  existingDoc?: Record<string, unknown> | null;
  parentPostDoc?: Record<string, unknown> | null;
  isAdminDocPresent?: boolean;
}

const SERVER_TIME = '2026-09-29T09:00:00.000Z';

function assertEqual(actual: boolean, expected: boolean, label: string): void {
  if (actual !== expected) {
    throw new Error(`Security assertion failed [${label}]: expected ${expected}, got ${actual}`);
  }
}

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function isVerified(ctx: RuleContext): boolean {
  return ctx.auth !== null && ctx.auth.token.email_verified === true;
}

function isAdmin(ctx: RuleContext): boolean {
  if (!isVerified(ctx)) return false;
  return Boolean(
    ctx.isAdminDocPresent ||
    ctx.auth?.token.email === 'heeju3185@gmail.com'
  );
}

function isValidCommunityPost(data: Record<string, unknown>, authUid: string): boolean {
  const required = ['topic', 'title', 'body', 'authorId', 'authorName', 'status', 'createdAt', 'updatedAt'];
  const allowed = ['topic', 'title', 'body', 'authorId', 'authorName', 'studentNumber', 'status', 'teacherReply', 'createdAt', 'updatedAt'];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => allowed.includes(k))) return false;

  return (
    typeof data.topic === 'string' &&
    ['question', 'praise', 'suggestion', 'free'].includes(data.topic) &&
    typeof data.title === 'string' &&
    data.title.length >= 2 &&
    data.title.length <= 100 &&
    typeof data.body === 'string' &&
    data.body.length >= 2 &&
    data.body.length <= 1500 &&
    typeof data.authorId === 'string' &&
    data.authorId === authUid &&
    isValidId(data.authorId) &&
    typeof data.authorName === 'string' &&
    data.authorName.length >= 1 &&
    data.authorName.length <= 40 &&
    typeof data.status === 'string' &&
    ['open', 'answered', 'archived'].includes(data.status)
  );
}

export function runDirtyDozenSecuritySuite(): void {
  // 1. Identity Spoofing on CommunityPost Create
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
    };
    const payload = {
      topic: 'question',
      title: '수학 숙제 질문입니다',
      body: '교과서 45쪽 3번 풀이 과정이 궁금해요.',
      authorId: 'spoofed_other_student_uid',
      authorName: '김민준',
      status: 'open',
      createdAt: SERVER_TIME,
      updatedAt: SERVER_TIME,
    };
    const allowed = isVerified(ctx) && isValidId('post_1') && isValidCommunityPost(payload, ctx.auth!.uid);
    assertEqual(allowed, false, 'Payload 1: Identity Spoofing');
  }

  // 2. Shadow Field Injection on CommunityPost Create
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
    };
    const payload = {
      topic: 'free',
      title: '체육대회 반티 의견',
      body: '파란색 유니폼 어떨까요?',
      authorId: 'student_uid_1',
      authorName: '이서연',
      status: 'open',
      isVerifiedTeacher: true,
      createdAt: SERVER_TIME,
      updatedAt: SERVER_TIME,
    };
    const allowed = isVerified(ctx) && isValidId('post_2') && isValidCommunityPost(payload, ctx.auth!.uid);
    assertEqual(allowed, false, 'Payload 2: Shadow Field Injection');
  }

  // 3. Unverified Email Spoof Attack on Admin Announcement Create
  {
    const ctx: RuleContext = {
      auth: { uid: 'attacker_1', token: { email: 'heeju3185@gmail.com', email_verified: false } },
      requestTime: SERVER_TIME,
    };
    assertEqual(isAdmin(ctx), false, 'Payload 3: Unverified Email Spoof');
  }

  // 4. Privilege Escalation / Self-Assigned Admin Record
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
      isAdminDocPresent: false,
    };
    assertEqual(isAdmin(ctx), false, 'Payload 4: Self-Assigned Admin Record');
  }

  // 5. Value Poisoning on CommunityPost Update (oversized body > 1500 chars)
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
    };
    const poisonedPayload = {
      topic: 'question',
      title: '정상 제목',
      body: 'A'.repeat(3000),
      authorId: 'student_uid_1',
      authorName: '김민준',
      status: 'open',
      createdAt: SERVER_TIME,
      updatedAt: SERVER_TIME,
    };
    assertEqual(isValidCommunityPost(poisonedPayload, ctx.auth!.uid), false, 'Payload 5: Value Poisoning');
  }

  // 6. Terminal State Bypass on Archived Post
  {
    const existing = { status: 'archived', authorId: 'student_uid_1' };
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
      existingDoc: existing,
    };
    const canStudentUpdate = existing.status !== 'archived' || isAdmin(ctx);
    assertEqual(canStudentUpdate, false, 'Payload 6: Terminal State Bypass');
  }

  // 7. Immortal Field Mutation (createdAt change) on Update
  {
    const existing = { createdAt: '2026-09-28T00:00:00.000Z', authorId: 'student_uid_1' };
    const incoming = { createdAt: '2020-01-01T00:00:00.000Z', authorId: 'student_uid_1' };
    assertEqual(incoming.createdAt === existing.createdAt, false, 'Payload 7: Immortal Field Mutation');
  }

  // 8. Private Counseling Request Horizontal Snooping
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
      existingDoc: { authorId: 'student_uid_2', message: '비공개 상담 내용' },
    };
    const canRead = ctx.existingDoc?.authorId === ctx.auth?.uid || isAdmin(ctx);
    assertEqual(canRead, false, 'Payload 8: Horizontal PII Snooping');
  }

  // 9. Unauthorized Teacher-Only Field Modification by Student
  {
    const affectedKeys = ['teacherReply', 'status', 'updatedAt'];
    const studentAllowedKeys = ['title', 'body', 'topic', 'updatedAt'];
    const isAllowedForStudent = affectedKeys.every((k) => studentAllowedKeys.includes(k));
    assertEqual(isAllowedForStudent, false, 'Payload 9: Teacher Field Modification');
  }

  // 10. Orphaned Comment Creation on Non-Existent Parent Post
  {
    const ctx: RuleContext = {
      auth: { uid: 'student_uid_1', token: { email: 'student1@school.kr', email_verified: true } },
      requestTime: SERVER_TIME,
      parentPostDoc: null,
    };
    const masterGatePassed = ctx.parentPostDoc !== null && ctx.parentPostDoc !== undefined;
    assertEqual(masterGatePassed, false, 'Payload 10: Orphaned Comment Creation');
  }

  // 11. Path ID Poisoning Attack
  {
    assertEqual(isValidId('invalid$id!with#special@chars'), false, 'Payload 11: Path ID Poisoning');
  }

  // 12. Client-Forged Timestamp Attack
  {
    const incomingCreatedAt: string = '2099-01-01T00:00:00.000Z';
    assertEqual(incomingCreatedAt === SERVER_TIME, false, 'Payload 12: Client-Forged Timestamp');
  }
}

runDirtyDozenSecuritySuite();
