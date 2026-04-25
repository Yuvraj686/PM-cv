# 🚀 ProjectHub

ProjectHub is a modern, full-stack project management platform designed for efficiency and collaboration. It features AI integration, GitHub synchronization, real-time chat, and a beautiful premium UI.

## ✨ Key Features

- **📊 Project & Task Management**: Organize work into projects with intuitive Kanban boards and task tracking.
- **💬 Real-time Chat**: Integrated WebSocket-based chat for team communication.
- **🤖 AI Integration**: Leverage AI to assist in project planning and task insights.
- **🔗 GitHub Sync**: Synchronize your projects with GitHub repositories and track commits directly.
- **🔔 Smart Notifications**: Get notified in real-time about updates, mentions, and project changes.
- **🛡️ Secure Auth**: Multi-modal authentication including Google OAuth, GitHub OAuth, Phone OTP (Twilio), and standard Email/Password verification.
- **📈 Analytics**: Visual data representation for project progress using Recharts.
- **📱 Premium UI/UX**: Sleek, mobile-responsive design with modern aesthetics and micro-animations.

## 🛠️ Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.12)
- **Database**: PostgreSQL (via Supabase)
- **Task Queue**: Celery with Redis
- **Real-time**: WebSockets
- **Authentication**: JWT & OAuth2 (Google/GitHub)

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: TailwindCSS & Framer Motion
- **UI Components**: Shadcn/UI & Bloom Design System
- **State Management**: Zustand
- **Real-time**: Socket.IO-client

---

## 🚀 Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- Docker Desktop (Running for Redis and local flows)

### 1. External Service Configuration
Configure your authorized redirect URIs in the Google and GitHub developer consoles:
- `http://localhost:8000/api/auth/google/callback`
- `http://localhost:8000/api/auth/github/callback`

### 2. Start Support Services (Redis)
```powershell
docker-compose up -d redis
```

### 3. Setup Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   .\.venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure your `.env` file with your credentials (Supabase, OpenAI, GitHub, Twilio, etc.).
5. Run the server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 4. Setup Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
The application will be live at: **http://localhost:3000**

---

## 🛠️ Maintenance & Troubleshooting
- **Logs**: Backend logs provide visibility into OTP codes and OAuth status.
- **Database**: Hosted on Supabase for scalability and reliability.
- **Performance**: Production builds (`npm run build`) are optimized with `<Suspense>` boundaries.

---
*Created with ❤️ by Yuvraj686*
