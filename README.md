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
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
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
| GET | `/api/words` | List all words (with filters) |
| GET | `/api/words/:id` | Get single word |
| GET | `/api/words/due` | Get words due for review |
| GET | `/api/themes` | List all themes |
| GET | `/api/themes/:slug` | Get theme with words |
| POST | `/api/progress/:wordId` | Update word progress |
| POST | `/api/sessions` | Start learning session |
| POST | `/api/sessions/:id/respond` | Submit session response |
| POST | `/api/sessions/:id/complete` | Complete session |
| GET | `/api/stats` | Get overall statistics |
| GET | `/api/stats/daily` | Get daily stats |

## Features

- 🎴 **Spaced Repetition** - SM-2 algorithm for optimal review scheduling
- 🏷️ **Theme-based Learning** - Organize vocabulary by topic
- 📊 **Progress Tracking** - Statistics and streak tracking
- 🔊 **Pronunciation** - Text-to-speech with Web Speech API
- 📱 **PWA** - Installable, works offline
- 🎯 **CEFR Levels** - A1-C2 difficulty levels
- 📚 **Oxford 3000/5000** - Based on Oxford word lists

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
