# Account Management, Progress & Custom Lists - Implementation Plan

## Overview

This document outlines the implementation of three major features:
1. Account Management (Auth, Roles, Admin)
2. Progress Management (Tracking, Goals, Streaks)
3. Custom Word Lists (CRUD, Sharing, LLM Generation)

---

## 1. Account Management

### 1.1 Authentication

**Methods:**
- Email/Password (basic auth)
- Google OAuth

**Session Strategy (Best Practices):**
- Access Token: JWT, 15 minutes expiry, stored in memory
- Refresh Token: Random string, 7 days expiry, stored in httpOnly cookie
- Refresh token rotation on each use
- Token revocation on logout/password change

**Guest Mode:**
- No authentication required
- Access limited to:
  - `GET /api/words/:word` - word lookup only
  - Returns: word, phoneticUs, phoneticUk, cefrLevel, oxfordList, definition
  - Does NOT return: examples, synonyms, antonyms, themes
- No progress tracking for guests

### 1.2 User Roles

| Role | Permissions |
|------|-------------|
| GUEST | Word lookup only (limited fields) |
| LEARNER | Full learning features, create lists, track progress |
| ADMIN | Manage users, manage subscriptions, system settings |

### 1.3 User Schema

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?   // null for OAuth-only users
  username      String    @unique
  role          Role      @default(LEARNER)
  
  // OAuth
  googleId      String?   @unique
  
  // Subscription (for monetization)
  subscriptionTier SubscriptionTier @default(FREE)
  subscriptionExpiresAt DateTime?
  
  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
  
  // Relations
  progress      UserProgress[]
  lists         StudyList[]
  sessions      LearningSession[]
  achievements  UserAchievement[]
  sharedLists   SharedList[]
  refreshTokens RefreshToken[]
  
  @@index([email])
  @@index([googleId])
}

enum Role {
  LEARNER
  ADMIN
}

enum SubscriptionTier {
  FREE      // Learner - $0
  EXPLORER  // Explorer - $4.99/mo
  WORDSMITH // Wordsmith - $9.99/mo
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  revoked   Boolean  @default(false)
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([token])
}
```

### 1.4 Account Actions

| Action | Endpoint | Description |
|--------|----------|-------------|
| Register | `POST /api/auth/register` | Email + password + username |
| Login | `POST /api/auth/login` | Email + password |
| Google OAuth | `GET /api/auth/google` | OAuth flow |
| Google Callback | `GET /api/auth/google/callback` | OAuth callback |
| Refresh | `POST /api/auth/refresh` | Refresh access token |
| Logout | `POST /api/auth/logout` | Revoke refresh token |
| Logout All | `POST /api/auth/logout-all` | Revoke all sessions |
| Me | `GET /api/auth/me` | Current user info |
| Change Password | `PUT /api/auth/password` | Update password |
| Delete Account | `DELETE /api/auth/account` | Delete user + all data |
| Export Data | `GET /api/auth/export` | GDPR export (JSON) |

*Note: Password reset deferred for MVP*

### 1.5 Admin Features

| Feature | Endpoint | Description |
|---------|----------|-------------|
| List Users | `GET /api/admin/users` | Paginated user list |
| Get User | `GET /api/admin/users/:id` | User details |
| Update User | `PUT /api/admin/users/:id` | Update role, subscription |
| Delete User | `DELETE /api/admin/users/:id` | Delete user |
| User Stats | `GET /api/admin/stats` | Platform statistics |
| Get Config | `GET /api/admin/config` | Get all system config |
| Update Config | `PUT /api/admin/config/:key` | Update config value |

---

## 2. Progress Management

### 2.1 Progress Tracking

**Scope:** Track progress per theme AND per level (not individual words)

```prisma
model UserProgress {
  id          String   @id @default(cuid())
  userId      String
  themeId     String?  // null for level-only progress
  level       String   // A1, A2, B1, B2, C1, C2
  
  // SM-2 Algorithm
  status      ProgressStatus @default(NEW)
  interval    Int      @default(0)
  easeFactor  Float    @default(2.5)
  nextReview  DateTime?
  lastReview  DateTime?
  
  // Stats
  wordsLearned   Int  @default(0)
  wordsMastered  Int  @default(0)
  totalReviews   Int  @default(0)
  correctReviews Int  @default(0)
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  theme Theme? @relation(fields: [themeId], references: [id])
  
  @@unique([userId, themeId, level])
  @@index([userId, nextReview])
}

enum ProgressStatus {
  NEW
  LEARNING
  REVIEWING
  MASTERED
}
```

### 2.2 Daily Goals

```prisma
model DailyGoal {
  id            String   @id @default(cuid())
  userId        String
  date          DateTime @db.Date
  
  // Goals
  wordsLearnedTarget   Int @default(10)
  wordsReviewedTarget  Int @default(20)
  
  // Actuals
  wordsLearned   Int @default(0)
  wordsReviewed  Int @default(0)
  
  // Sentences (review by making sentences)
  sentencesCreated Int @default(0)
  
  completed     Boolean  @default(false)
  completedAt   DateTime?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, date])
  @@index([userId, date])
}
```

### 2.3 Streaks

```prisma
model UserStreak {
  id              String   @id @default(cuid())
  userId          String   @unique
  
  currentStreak   Int      @default(0)
  longestStreak   Int      @default(0)
  lastActivityDate DateTime?
  
  // Grace period: 1 per week, resets every Monday
  gracePeriodsUsed Int     @default(0)
  gracePeriodWeek  String? // ISO week string "2026-W12"
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 2.4 Achievements

```prisma
model Achievement {
  id          String   @id @default(cuid())
  key         String   @unique  // e.g., "first_word", "streak_7", "level_a1"
  name        String
  description String
  icon        String   // emoji
  category    String   // "learning", "streak", "mastery"
  
  // Condition
  conditionType  String // "words_learned", "streak_days", "level_complete"
  conditionValue Int
  
  // Reward (for future monetization)
  rewardDays Int? // subscription days awarded
  
  userAchievements UserAchievement[]
}

model UserAchievement {
  id           String   @id @default(cuid())
  userId       String
  achievementId String
  unlockedAt   DateTime @default(now())
  
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievement Achievement @relation(fields: [achievementId], references: [id])
  
  @@unique([userId, achievementId])
}
```

### 2.5 Dashboard Data

**API Endpoint:** `GET /api/progress/dashboard`

```json
{
  "streak": {
    "current": 7,
    "longest": 14,
    "lastActivity": "2026-03-24"
  },
  "today": {
    "wordsLearned": 5,
    "wordsLearnedGoal": 10,
    "wordsReviewed": 15,
    "wordsReviewedGoal": 20,
    "completed": false
  },
  "overall": {
    "totalWordsLearned": 250,
    "totalWordsMastered": 80,
    "accuracy": 0.85
  },
  "cefrProgress": {
    "A1": { "learned": 100, "total": 883, "percent": 11 },
    "A2": { "learned": 80, "total": 790, "percent": 10 },
    "B1": { "learned": 50, "total": 689, "percent": 7 },
    "B2": { "learned": 20, "total": 1296, "percent": 2 },
    "C1": { "learned": 0, "total": 1275, "percent": 0 }
  },
  "nextReview": {
    "count": 12,
    "earliestDate": "2026-03-25T08:00:00Z"
  }
}
```

---

## 3. Custom Word Lists

### 3.1 List Schema

```prisma
model StudyList {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  color       String   @default("#6366f1")
  icon        String   @default("📚")
  isSystem    Boolean  @default(false)  // System lists (themes/levels)
  isPinned    Boolean  @default(false)
  wordCount   Int      @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  words       StudyListWord[]
  sharedWith  SharedList[]
  
  @@index([userId])
  @@index([isSystem])
}

model StudyListWord {
  listId    String
  wordId    String
  addedAt   DateTime @default(now())
  addedBy   String   // userId who added (for future collab)
  
  list  StudyList @relation(fields: [listId], references: [id], onDelete: Cascade)
  word  Word      @relation(fields: [wordId], references: [id], onDelete: Cascade)
  
  @@id([listId, wordId])
  @@index([listId])
  @@index([wordId])
}

model SharedList {
  id        String   @id @default(cuid())
  listId    String
  sharedBy  String   // userId who shared
  sharedWith String  // userId who can view
  
  createdAt DateTime @default(now())
  
  list      StudyList @relation(fields: [listId], references: [id], onDelete: Cascade)
  
  @@unique([listId, sharedWith])
  @@index([sharedWith])
}
```

### 3.2 System Lists (Auto-generated)

Created on user registration:
- All A1 Words
- All A2 Words
- All B1 Words
- All B2 Words
- All C1 Words
- All C2 Words
- Theme lists (Business, Education, etc.)

### 3.3 List Endpoints

| Action | Endpoint | Description |
|--------|----------|-------------|
| List My Lists | `GET /api/lists` | User's lists + shared with user |
| Get List | `GET /api/lists/:id` | List details with words |
| Create List | `POST /api/lists` | Create custom list |
| Update List | `PUT /api/lists/:id` | Update name/description |
| Delete List | `DELETE /api/lists/:id` | Delete list (not system) |
| Add Word | `POST /api/lists/:id/words` | Add word to list |
| Remove Word | `DELETE /api/lists/:id/words/:wordId` | Remove word |
| Pin List | `PUT /api/lists/:id/pin` | Pin/unpin list |
| Share List | `POST /api/lists/:id/share` | Share with user by email |
| Unshare List | `DELETE /api/lists/:id/share/:userId` | Remove access |
| Generate List | `POST /api/lists/generate` | LLM-generated list |

### 3.4 LLM List Generation

**Endpoint:** `POST /api/lists/generate`

**Request:**
```json
{
  "query": "words related to cooking and kitchen",
  "name": "Cooking Vocabulary",
  "maxWords": 50
}
```

**Response:**
```json
{
  "name": "Cooking Vocabulary",
  "description": "Words related to cooking and kitchen activities",
  "words": ["chef", "recipe", "ingredient", "boil", "fry", ...]
}
```

**Implementation:**
- Use OpenAI API (GPT-4 or GPT-3.5)
- Match returned words to database
- Only include words that exist in Oxford list
- User can edit before saving

---

## 4. API Routes Summary

### Public Routes (Guest Access)

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/words/:word` | Limited fields for guests |

### Auth Routes (No Auth Required)

| Method | Endpoint |
|--------|----------|
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| GET | `/api/auth/google` |
| GET | `/api/auth/google/callback` |
| POST | `/api/auth/refresh` |

### Protected Routes (Auth Required)

| Method | Endpoint |
|--------|----------|
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |
| POST | `/api/auth/logout-all` |
| PUT | `/api/auth/password` |
| DELETE | `/api/auth/account` |
| GET | `/api/auth/export` |
| GET | `/api/words` |
| GET | `/api/words/:id` |
| GET | `/api/themes` |
| GET | `/api/themes/:slug` |
| GET | `/api/progress/dashboard` |
| GET | `/api/progress/streak` |
| GET | `/api/progress/calendar` |
| POST | `/api/progress/update` |
| GET | `/api/lists` |
| POST | `/api/lists` |
| ... | (all list routes) |

### Admin Routes (Admin Role Required)

| Method | Endpoint |
|--------|----------|
| GET | `/api/admin/users` |
| GET | `/api/admin/users/:id` |
| PUT | `/api/admin/users/:id` |
| DELETE | `/api/admin/users/:id` |
| GET | `/api/admin/stats` |

---

## 5. Frontend Changes

### New Pages/Components

1. **Auth Pages**
   - Login page
   - Register page
   - Forgot password page
   - Reset password page
   - OAuth callback handler

2. **Dashboard Updates**
   - Streak display
   - Daily goals progress
   - CEFR level progress bars
   - Achievement badges
   - Calendar heatmap

3. **Lists Page**
   - My lists view
   - List detail view (with word search)
   - Create list modal
   - Share list modal
   - Generate list modal (LLM)

4. **Admin Panel** (New)
   - User management table
   - User detail view
   - Subscription management
   - Platform statistics

### Navigation Updates

```
Home (Dashboard)
Learn
Review
Browse
Lists (New)
Stats
Admin (Admin only)
```

---

## 6. Implementation Phases

### Phase 1: Auth Foundation (Week 1)
- [ ] Update Prisma schema (User, RefreshToken, SubscriptionTier)
- [ ] Implement password hashing (bcrypt)
- [ ] JWT generation/validation utilities
- [ ] Auth middleware
- [ ] Register/Login endpoints
- [ ] Refresh token flow
- [ ] Logout endpoints
- [ ] Frontend auth pages
- [ ] Protected route guards

### Phase 2: OAuth & Admin (Week 2)
- [ ] Google OAuth setup
- [ ] OAuth callback handling
- [ ] Account deletion
- [ ] GDPR export
- [ ] Admin middleware
- [ ] Admin user management endpoints
- [ ] Admin config endpoints (LLM settings)
- [ ] Admin frontend panel

### Phase 3: Progress System (Week 3)
- [ ] Update Prisma schema (UserProgress, DailyGoal, UserStreak, Achievement)
- [ ] Migrate SM-2 to work per theme/level
- [ ] Dashboard endpoint
- [ ] Daily goal tracking
- [ ] Streak calculation (with grace period)
- [ ] Achievement system (emoji icons)
- [ ] Calendar heatmap component
- [ ] Dashboard UI updates

### Phase 4: Word Lists (Week 4)
- [ ] Update Prisma schema (StudyList, StudyListWord, SharedList)
- [ ] System list generation
- [ ] List CRUD endpoints
- [ ] Word add/remove endpoints
- [ ] Share functionality
- [ ] Pin functionality
- [ ] Subscription tier limits enforcement
- [ ] Lists frontend page
- [ ] List detail view with search

### Phase 5: LLM Integration (Week 5)
- [ ] SystemConfig model for LLM settings
- [ ] OpenAI API compatible service
- [ ] List generation endpoint
- [ ] Word matching logic
- [ ] Generate list UI
- [ ] Rate limiting per tier
- [ ] Error handling

---

## 7. Environment Variables

```env
# Auth
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:7101/api/auth/google/callback

# LLM (OpenAI API compatible - admin configurable)
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-3.5-turbo

# Frontend
FRONTEND_URL=http://localhost:7100
```

---

## 8. Subscription Tiers

| Tier | Name | Price | Limits |
|------|------|-------|--------|
| FREE | Learner | $0 | 5 lists, 25 words/list, basic features |
| 1 | Explorer | $4.99/mo | 10 lists, 50 words/list, LLM generation |
| 2 | Wordsmith | $9.99/mo | Unlimited lists, 100 words/list, priority support |

**Tier Features:**

| Feature | Learner (Free) | Explorer | Wordsmith |
|---------|---------------|----------|-----------|
| Lists | 5 | 10 | Unlimited |
| Words per list | 25 | 50 | 100 |
| LLM list generation | ❌ | ✅ (10/month) | ✅ (Unlimited) |
| Streak grace period | ❌ | ✅ 1/week | ✅ 1/week |
| Export data | ✅ | ✅ | ✅ |
| Word lookup | ✅ | ✅ | ✅ |
| Progress tracking | ✅ | ✅ | ✅ |

---

## 9. Grace Period

- **Allowance:** 1 grace period per week
- **Reset time:** Monday 12:00 PM (noon) GMT+0
- **Usage:** If you miss a day, streak is preserved (if grace available)
- **Display:** Show remaining grace periods to user

```typescript
// Grace period calculation
function getGracePeriodWeek(): string {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay() + 1); // Monday
  startOfWeek.setUTCHours(12, 0, 0, 0); // Noon GMT
  return startOfWeek.toISOString().split('T')[0];
}
```

---

## 10. Achievement System (MVP)

**Achievements use simple emoji + name:**

| Key | Name | Description | Icon | Condition |
|-----|------|-------------|------|-----------|
| first_word | First Steps | Learn your first word | 🎯 | words_learned >= 1 |
| words_10 | Getting Started | Learn 10 words | 🌱 | words_learned >= 10 |
| words_50 | Building Vocabulary | Learn 50 words | 📚 | words_learned >= 50 |
| words_100 | Century | Learn 100 words | 💯 | words_learned >= 100 |
| words_500 | Word Collector | Learn 500 words | 🏆 | words_learned >= 500 |
| words_1000 | Vocabulary Master | Learn 1000 words | 👑 | words_learned >= 1000 |
| streak_3 | On Fire | 3-day streak | 🔥 | streak >= 3 |
| streak_7 | Week Warrior | 7-day streak | ⭐ | streak >= 7 |
| streak_30 | Monthly Master | 30-day streak | 🌟 | streak >= 30 |
| streak_100 | Centurion | 100-day streak | 💎 | streak >= 100 |
| level_a1 | A1 Complete | Master all A1 words | 🥉 | A1 mastery >= 100% |
| level_a2 | A2 Complete | Master all A2 words | 🥈 | A2 mastery >= 100% |
| level_b1 | B1 Complete | Master all B1 words | 🥇 | B1 mastery >= 100% |
| level_b2 | B2 Complete | Master all B2 words | 🏅 | B2 mastery >= 100% |
| level_c1 | C1 Complete | Master all C1 words | 🎖️ | C1 mastery >= 100% |
| theme_complete | Theme Master | Complete a theme | 🎨 | Any theme 100% |
| first_list | Curator | Create your first list | 📝 | lists_created >= 1 |
| share_list | Sharer | Share a list with someone | 🤝 | lists_shared >= 1 |
| perfect_session | Perfectionist | 100% accuracy in session | ✨ | perfect session |
| early_bird | Early Bird | Study before 7 AM | 🐦 | study before 7am |
| night_owl | Night Owl | Study after 11 PM | 🦉 | study after 11pm |

---

## 11. LLM Configuration (Admin)

**Admin can configure LLM settings:**

```prisma
model SystemConfig {
  id    String @id @default(cuid())
  key   String @unique
  value String
  
  @@index([key])
}

// Keys:
// llm_api_url - e.g., "https://api.openai.com/v1"
// llm_api_key - encrypted API key
// llm_model - e.g., "gpt-3.5-turbo", "gpt-4"
// llm_max_tokens - max tokens for response
```

**Admin Endpoints:**
- `GET /api/admin/config` - Get all config
- `PUT /api/admin/config/:key` - Update config value

**LLM Service:**
```typescript
interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

async function generateWordList(query: string, maxWords: number): Promise<string[]> {
  const config = await getLLMConfig();
  
  const response = await fetch(`${config.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'You are a vocabulary assistant. Return only a JSON array of English words.'
        },
        {
          role: 'user',
          content: `Generate ${maxWords} English words related to: ${query}. Return only a JSON array of words, no explanation.`
        }
      ],
      max_tokens: config.maxTokens,
    }),
  });
  
  // Parse response and match against database
}
```

---

## 12. Removed Features (Deferred)

- ~~Password reset~~ - Ignore for MVP
- ~~Email verification~~ - Ignore for MVP
- ~~Custom achievement icons~~ - Use emojis for MVP
- ~~Gamification (XP, levels)~~ - Ignore for MVP
- ~~Leaderboards~~ - Ignore for MVP

---

## 8. Security Considerations

1. **Password Security**
   - bcrypt with cost factor 12
   - Minimum 8 characters
   - No maximum length (allow passphrases)

2. **JWT Security**
   - Short expiry (15 min)
   - Signed with strong secret
   - No sensitive data in payload

3. **Refresh Token Security**
   - Stored in httpOnly cookie
   - Secure flag in production
   - SameSite strict
   - Rotation on each use

4. **Rate Limiting**
   - Login: 5 attempts per 15 min
   - Register: 3 per hour
   - Password reset: 3 per hour
   - API: 100 requests per minute

5. **Authorization**
   - Users can only access their own data
   - Admin cannot access user profiles/progress
   - Admin can only manage: role, subscription, account status

---

## 9. Questions / Decisions Needed

1. ~~Email provider for password reset?~~ → **Deferred for MVP**
2. ~~OpenAI model for list generation?~~ → **Admin configurable, OpenAI API compatible**
3. ~~Subscription tiers definition?~~ → **Learner (Free), Explorer ($4.99), Wordsmith ($9.99)**
4. ~~Achievement icons?~~ → **Emojis for MVP**
5. ~~Grace period?~~ → **1 per week, resets Monday noon GMT+0**

**No more blockers - ready to implement!**
