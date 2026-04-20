# 🚀 ProjectHub

ProjectHub is a modern, full-stack project management platform designed for efficiency and collaboration. It features AI integration, GitHub synchronization, real-time chat, and a beautiful Kanban-style task management system.

## ✨ Key Features

- **📊 Project & Task Management**: Organize work into projects with intuitive Kanban boards and task tracking.
- **💬 Real-time Chat**: Integrated WebSocket-based chat for team communication.
- **🤖 AI Integration**: Leverage AI to assist in project planning and task insights.
- **🔗 GitHub Sync**: Synchronize your projects with GitHub repositories to stay in sync with your code.
- **🔔 Smart Notifications**: Get notified in real-time about updates, mentions, and project changes.
- **🛡️ Secure Auth**: JWT-based authentication with role-based access control.

## 🛠️ Technology Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL (via Supabase)
- **Task Queue**: Celery with Redis
- **Real-time**: WebSockets
- **Authentication**: JWT & OAuth2

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: TailwindCSS & Framer Motion
- **UI Components**: Shadcn/UI
- **State Management**: Zustand
- **Real-time**: Socket.IO-client

## 🚀 Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- Docker & Docker Compose (optional, for local services)

### Setup Backend

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv .venv
    # Windows:
    .\.venv\Scripts\activate
    # Linux/Mac:
    source .venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Configure your `.env` file with your credentials (Supabase, OpenAI, GitHub, etc.).
5.  Run the server:
    ```bash
    uvicorn main:app --reload
    ```

### Setup Frontend

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the development server:
    ```bash
    npm run dev
    ```

## 🐳 Docker
You can also run the entire infrastructure using Docker Compose:
```bash
docker-compose up
```

---
*Created with ❤️ by Yuvraj686*
