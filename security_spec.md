# Security Specification: 해솔반 우리교실 (Classroom Homepage)

## 1. Data Invariants

1. **Global Default Deny**: All unlisted paths default to `allow read, write: if false;`.
2. **Verified Identity & Admin Role (`isAdmin`)**:
   - All write operations require `isSignedIn()` and `request.auth.token.email_verified == true`.
   - Teacher/Admin privileges (`isAdmin()`) require either a document in `/admins/$(request.auth.uid)` OR the bootstrapped teacher email `heeju3185@gmail.com` with `request.auth.token.email_verified == true`.
   - Regular users cannot self-assign admin records in `/admins/{adminId}`.
3. **Path Variable Hardening (`isValidId`)**:
   - Every single-document target operation (`get`, `create`, `update`, `delete`) validates its path ID variable with `isValidId(id)` (`id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
   - `isValidId` is never applied to `list` rules.
4. **Master Gate & Relational Consistency**:
   - Subcollection `/posts/{postId}/comments/{commentId}` verifies the parent `/posts/$(postId)` exists and is not in terminal `archived` state when creating or updating comments, and ensures `incoming().postId == postId`.
5. **Strict Validation Blueprints (`isValid[Entity]`) & Anti-Update-Gap**:
   - Every `create` and `update` rule begins with `isSignedIn() && isVerified() && isValidId(...) && isValid[Entity](incoming())`.
   - Required keys are enforced via `data.keys().hasAll(...)` and shadow fields are blocked via `data.keys().hasOnly(...)`.
   - Every string field enforces exact `minLength` and `maxLength` bounds from `firebase-blueprint.json`.
   - Author identity (`authorId`) must equal `request.auth.uid` on creation and remain immutable (`incoming().authorId == existing().authorId`) on update.
6. **Temporal Integrity & Immortal Fields**:
   - `createdAt == request.time` and `updatedAt == request.time` on `create`.
   - `createdAt == existing().createdAt` and `updatedAt == request.time` on `update`.
7. **Terminal State Locking**:
   - `CommunityPost` documents with `existing().status == 'archived'` and `CounselingRequest` documents with `existing().status == 'completed'` are locked against further non-admin updates.
8. **PII / Private Consultation Isolation & Query Enforcement**:
   - `counselingRequests/{requestId}` contains sensitive student counseling messages. Both `get` and `list` are strictly restricted to `resource.data.authorId == request.auth.uid || isAdmin()`.
   - Public classroom collections (`announcements`, `posts`, `lunchMenus`, `schedules`) enforce `resource.data` field constraints on `list` so no blanket `if isSignedIn()` list rule exists.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on CommunityPost Create)**:
   ```json
   {
     "topic": "question",
     "title": "수학 숙제 질문입니다",
     "body": "교과서 45쪽 3번 풀이 과정이 궁금해요.",
     "authorId": "spoofed_other_student_uid",
     "authorName": "김민준",
     "status": "open",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`incoming().authorId == request.auth.uid` fails).

2. **Payload 2 (Shadow Field Injection on CommunityPost Create)**:
   ```json
   {
     "topic": "free",
     "title": "체육대회 반티 의견",
     "body": "파란색 유니폼 어떨까요?",
     "authorId": "student_uid_1",
     "authorName": "이서연",
     "status": "open",
     "isVerifiedTeacher": true,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` rejects ghost field `isVerifiedTeacher`).

3. **Payload 3 (Unverified Email Spoof Attack on Admin Announcement Create)**:
   - Auth Context: `{ uid: "attacker_1", token: { email: "heeju3185@gmail.com", email_verified: false } }`
   ```json
   {
     "title": "가짜 휴교 안내",
     "category": "notice",
     "content": "내일은 임시 휴교입니다.",
     "isPinned": true,
     "authorId": "attacker_1",
     "authorName": "담임교사",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`request.auth.token.email_verified == true` fails).

4. **Payload 4 (Privilege Escalation / Self-Assigned Admin Record)**:
   - Path: `/admins/student_uid_1`
   ```json
   {
     "uid": "student_uid_1",
     "role": "admin",
     "createdAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Only an existing verified admin can write to `/admins/{adminId}`).

5. **Payload 5 (Value Poisoning on CommunityPost Update)**:
   - Path: `/posts/post_1` (Updating whitelisted key `body` with an oversized 3,000-character string exceeding `maxLength: 1500`).
   ```json
   {
     "body": "A... (3000 chars)"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`isValidCommunityPost(incoming())` wraps update and blocks `body.size() > 1500`).

6. **Payload 6 (Terminal State Bypass on Archived Post)**:
   - Path: `/posts/archived_post_1` where `existing().status == 'archived'`.
   - Student attempts to update `body`.
   ```json
   {
     "body": "종료된 게시글 강제 수정 시도",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`existing().status != 'archived'` lock blocks non-admin update).

7. **Payload 7 (Immortal Field Mutation on Update)**:
   - Path: `/posts/post_1`
   - Author attempts to mutate `createdAt` or `authorId` during update.
   ```json
   {
     "title": "수정된 제목",
     "body": "수정된 본문입니다.",
     "createdAt": "2020-01-01T00:00:00Z",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`incoming().createdAt == existing().createdAt` and `affectedKeys().hasOnly(...)` reject `createdAt` mutation).

8. **Payload 8 (PII / Private Counseling Request Horizontal Snooping)**:
   - Path: `/counselingRequests/req_student_2`
   - Authenticated `student_uid_1` attempts `get` on `student_uid_2`'s counseling request.
   *Expected*: `PERMISSION_DENIED` (`existing().authorId == request.auth.uid || isAdmin()` blocks non-owner read).

9. **Payload 9 (Unauthorized Teacher-Only Field Modification by Student)**:
   - Path: `/posts/post_1`
   - Student author attempts to set `teacherReply` and `status: "answered"`.
   ```json
   {
     "teacherReply": "선생님 사칭 답변",
     "status": "answered",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Student update action only permits `['title', 'body', 'topic', 'updatedAt']` while `teacherReply` remains untouched).

10. **Payload 10 (Orphaned Comment Creation on Non-Existent Parent Post)**:
    - Path: `/posts/non_existent_post/comments/comment_1`
    ```json
    {
      "postId": "non_existent_post",
      "content": "없는 게시글에 댓글 달기",
      "authorId": "student_uid_1",
      "authorName": "김민준",
      "createdAt": "SERVER_TIMESTAMP",
      "updatedAt": "SERVER_TIMESTAMP"
    }
    ```
    *Expected*: `PERMISSION_DENIED` (Master Gate `exists(/databases/$(database)/documents/posts/$(postId))` fails).

11. **Payload 11 (Path ID Poisoning Attack)**:
    - Path: `/posts/invalid$id!with#special@chars`
    - Attempting to create a post with malformed document ID.
    *Expected*: `PERMISSION_DENIED` (`isValidId(postId)` regex `^[a-zA-Z0-9_\-]+$` fails).

12. **Payload 12 (Client-Forged Timestamp Attack)**:
    - Path: `/counselingRequests/req_1`
    - Client provides a past or future timestamp instead of `request.time`.
    ```json
    {
      "topic": "study",
      "preferredDate": "2026-10-05",
      "message": "진로 상담 신청합니다.",
      "authorId": "student_uid_1",
      "authorName": "김민준",
      "status": "pending",
      "createdAt": "2099-01-01T00:00:00Z",
      "updatedAt": "2099-01-01T00:00:00Z"
    }
    ```
    *Expected*: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).
