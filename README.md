# Vocab Master 📚

A vocabulary learning application with spaced repetition, built with Vue 3, Node.js, and PostgreSQL.

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite + Tailwind CSS + Pinia
- **Backend**: Node.js + TypeScript + Fastify + Prisma
- **Database**: PostgreSQL 15
- **Infrastructure**: Docker + Docker Compose

## Project Structure

```
vocab-master/
├── apps/
│   ├── frontend/           # Vue 3 frontend
│   │   ├── src/
│   │   │   ├── components/ # Vue components
│   │   │   ├── views/      # Page views
│   │   │   ├── stores/     # Pinia stores
│   │   │   ├── composables/# Vue composables
│   │   │   ├── lib/        # Utilities
│   │   │   └── types/      # TypeScript types
│   │   └── Dockerfile
│   │
│   └── backend/            # Node.js backend
│       ├── src/
│       │   ├── routes/     # API routes
│       │   ├── lib/        # Utilities (Prisma, SRS)
│       │   └── types/      # TypeScript types
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── seed.ts
│       └── Dockerfile
│
├── docker-compose.yml      # Production Docker
├── docker-compose.dev.yml  # Development Docker (DB only)
└── package.json            # Root workspace config
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm 10+

### Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start PostgreSQL with Docker**
   ```bash
   npm run dev:db
   ```

3. **Run database migrations** (first time only)
   ```bash
   npm run migrate:init
   ```

4. **Seed the database**
   ```bash
   npm run seed
   ```

5. **Start development servers**
   
   Terminal 1 (Backend):
   ```bash
   npm run dev:backend
   ```
   
   Terminal 2 (Frontend):
   ```bash
   npm run dev:frontend
   ```

   Or both at once:
   ```bash
   npm run dev
   ```

6. **Open the app**
   - Frontend: http://localhost:7100
   - Backend API: http://localhost:7101
   - Adminer (DB UI): http://localhost:8080

### One-line Setup

After starting the database, wait a few seconds for PostgreSQL to initialize, then run:
```bash
npm run setup:full && npm run dev
```

Or manually if `setup:full` fails (database not ready yet):
```bash
npm run dev:db        # Wait 5-10 seconds for PostgreSQL to start
npm run generate      # Generate Prisma client
npm run migrate:init  # Run migrations
npm run seed          # Seed sample data
npm run dev           # Start dev servers
```

### Docker Deployment

Build and run everything with Docker:

```bash
npm run docker:build
npm run docker:up
```

Access the app at http://localhost

To stop:
```bash
npm run docker:down
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Auth** | | |
| POST | `/api/auth/register` | Register new user (5/min) |
| POST | `/api/auth/login` | Login (5/min) |
| POST | `/api/auth/refresh` | Refresh tokens (10/min) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| **Words** | | |
| GET | `/api/words` | List words (filter, paginate) |
| GET | `/api/words/:id` | Get single word |
| GET | `/api/words/due` | Get words due for review |
| GET | `/api/words/search` | Search words |
| **Themes** | | |
| GET | `/api/themes` | List all themes |
| GET | `/api/themes/:slug` | Get theme with words |
| **Progress** | | |
| GET | `/api/progress/dashboard` | Dashboard data |
| POST | `/api/progress/:wordId` | Update word progress |
| POST | `/api/progress/batch` | Batch update progress |
| GET | `/api/progress/achievements` | List achievements |
| GET | `/api/progress/calendar` | Activity calendar |
| **Sessions** | | |
| POST | `/api/sessions` | Start learning session |
| POST | `/api/sessions/:id/respond` | Submit response |
| POST | `/api/sessions/:id/complete` | Complete session |
| **Lists** | | |
| GET | `/api/lists` | User's study lists |
| POST | `/api/lists` | Create list |
| PUT | `/api/lists/:id` | Update list |
| DELETE | `/api/lists/:id` | Delete list |
| POST | `/api/lists/:id/words` | Add words to list |
| DELETE | `/api/lists/:id/words/:wordId` | Remove word from list |
| **Admin** | | |
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/users` | List users (paginated) |
| GET | `/api/admin/llm/providers` | List LLM providers |
| POST | `/api/admin/llm/providers` | Create provider |
| POST | `/api/admin/jobs/categorize` | Start categorize job |
| GET | `/api/admin/jobs` | List background jobs |

## Features

- 🎴 **Spaced Repetition** - SM-2 algorithm for optimal review scheduling
- 🏷️ **Theme-based Learning** - Organize vocabulary by topic (9 categories via LLM)
- 📊 **Progress Tracking** - Statistics, streaks, daily goals, achievements, calendar heatmap
- 🔊 **Pronunciation** - Text-to-speech with Web Speech API
- 📱 **PWA** - Installable, works offline
- 🎯 **CEFR Levels** - A1-C2 difficulty levels
- 📚 **Oxford 3000/5000** - Based on Oxford word lists (4,921 words)
- 🔐 **Authentication** - JWT + refresh tokens, Google OAuth, role-based access
- 👨‍💼 **Admin Panel** - User management, word import/export, LLM categorization
- 🤖 **LLM Categorization** - Auto-categorize words using any OpenAI-compatible API
- 📋 **Custom Word Lists** - Create and manage personal study lists
- ⚡ **Rate Limiting** - Global + per-route rate limiting for security
- 🔄 **Background Jobs** - Long-running LLM tasks with progress tracking

## LLM Word Categorization

Words can be automatically categorized into 9 themes using any OpenAI-compatible LLM:

```bash
# Categorize uncategorized words (CLI)
npm run categorize -w apps/backend
npm run categorize:100 -w apps/backend

# Options: --limit=N, --all, --dry-run, --verbose/-v
```

Or use the **Admin Panel → Categorization** tab for background job processing.

### Supported Providers
- OpenAI (GPT-4o, GPT-4o-mini, etc.)
- Anthropic (Claude) via OpenAI-compatible endpoint
- DeepSeek
- Groq
- OpenRouter
- Any OpenAI-compatible API

### Setup
1. Go to **Admin → Config** tab
2. Add a new LLM provider (name, provider, model, base URL, API key)
3. Set it as active
4. Run categorization from CLI or admin panel

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend |
| `npm run dev:frontend` | Start frontend dev server |
| `npm run dev:backend` | Start backend dev server |
| `npm run dev:db` | Start PostgreSQL with Docker |
| `npm run seed` | Seed database with sample words |
| `npm run migrate` | Create a new Prisma migration |
| `npm run migrate:init` | Run initial migration |
| `npm run generate` | Generate Prisma client |
| `npm run studio` | Open Prisma Studio |
| `npm run setup` | Full setup (install, db, migrate, seed) |
| `npm run docker:build` | Build Docker images |
| `npm run docker:up` | Start all services with Docker |
| `npm run docker:down` | Stop Docker services |
| `npm run crawl` | Crawl word definitions from Oxford Dictionary |
| `npm run crawl:batch -- --batch=100` | Crawl specific batch size |
| `npm run crawl:dry` | Test crawler without saving |
| `npm run categorize -w apps/backend` | Categorize uncategorized words via LLM |
| `npm run categorize:100 -w apps/backend` | Categorize 100 words via LLM |

## Crawling Word Definitions

The app comes with ~4,933 words from the Oxford 3000/5000 lists. To add definitions, phonetics, and examples:

```bash
# Crawl 100 words (default)
npm run crawl

# Crawl specific batch size
npm run crawl:batch -- --batch=50

# Resume from last position (automatic)
npm run crawl

# Test without saving
npm run crawl:dry

# Options
npm run crawl -- --batch=100 --delay=2000 --no-resume
```

**Note**: The crawler respects rate limits (~1.5s between requests). Full crawl takes ~2 hours.

## Tech Stack Details

### Frontend
- **Vue 3** - Composition API with `<script setup>`
- **TypeScript** - Full type safety
- **Vite** - Fast dev server and build tool
- **Tailwind CSS** - Utility-first styling
- **Pinia** - State management
- **Vue Router** - SPA routing
- **Vite PWA** - Progressive web app support

### Backend
- **Fastify** - High-performance web framework
- **Prisma** - Type-safe ORM
- **Zod** - Runtime validation
- **PostgreSQL** - Robust relational database

### Infrastructure
- **Docker** - Containerization
- **nginx** - Static file serving and reverse proxy
- **Multi-stage builds** - Optimized production images

## License

MIT
