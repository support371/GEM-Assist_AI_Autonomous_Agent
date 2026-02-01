# AI Agent Builder

## Overview

AI Agent Builder is an autonomous AI development assistant built as a cross-platform mobile/web application using Expo (React Native) with an Express.js backend. The application transforms natural language requests into production-ready code through a conversational interface. Users interact with an AI agent that can analyze requirements, research best practices, design architectures, and generate complete code solutions with live preview capabilities.

The application follows a dual-panel design philosophy where conversation flows alongside generated code, creating a tangible sense of AI-powered development.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture (Expo/React Native)

**Framework**: Expo SDK 54 with React Native 0.81, supporting iOS, Android, and web platforms from a single codebase.

**Navigation Structure**:
- Root stack navigator with main tabs, chat screens, and modals
- Bottom tab navigator for Home (conversation list) and Profile screens
- Native stack navigation for smooth transitions with gesture support

**State Management**:
- TanStack React Query for server state and API caching
- Local component state with React hooks
- Shared values via Reanimated for animations

**UI/Theming**:
- Custom theming system with light/dark mode support via `useTheme` hook
- Consistent spacing, typography, and border radius tokens in `constants/theme.ts`
- Reanimated for fluid animations and gesture interactions
- Linear gradients and blur effects for premium visual aesthetic

**Key Components**:
- `ChatInput` - Message input with gradient send button and haptic feedback
- `MessageBubble` - Renders user/assistant messages with inline code blocks, syntax highlighting, and per-block copy
- `CodePreview` - Multi-file code viewer with tabs, syntax highlighting, language badges, line counts, and copy functionality
- `WebPreview` - Live HTML/CSS/JS preview using iframe (web) or WebView (native), supports responsive device modes
- `AgentStatus` - Animated status indicator showing agent phases (Analyzing, Planning, Researching, Generating, Complete) with gradient backgrounds and pulse effects
- `TaskExecutor` - Step-by-step task execution visualization with status icons and connecting lines
- `ProjectFiles` - File browser showing generated code files with language icons, colors, and line counts
- `QuickPrompts` - 6 pre-built template cards for rapid project starts (Landing Page, Dashboard, E-commerce, Auth System, Chat Interface, API Integration)
- `EmptyState` - Enhanced empty state with agent capabilities badges and professional branding

### Backend Architecture (Express.js)

**Server Framework**: Express 5 with TypeScript, compiled via esbuild for production.

**API Design**: RESTful JSON API with Server-Sent Events (SSE) for real-time streaming responses.

**Core Endpoints**:
- `GET/POST/DELETE /api/conversations` - Conversation CRUD operations
- `POST /api/conversations/:id/messages` - Send message and stream AI response
- `POST /api/generate-image` - AI image generation

**AI Integration**: OpenAI SDK configured with Replit AI Integrations environment variables for chat completions, image generation, text-to-speech, and speech-to-text capabilities.

### Data Storage

**Database**: PostgreSQL via Drizzle ORM with the following schema:
- `users` - User accounts with username/password
- `conversations` - Chat sessions with titles and timestamps  
- `messages` - Individual messages linked to conversations with role (user/assistant) and content

**Migrations**: Managed via `drizzle-kit push` command, output to `/migrations` directory.

### AI Agent Capabilities

The system prompt configures an elite autonomous development agent with professional-grade capabilities:

**Core Capabilities:**
- **Requirements Analysis** - Deep understanding of user intent, implicit needs, edge cases
- **Research & Knowledge Synthesis** - Comprehensive knowledge of languages, frameworks, patterns, security
- **Architecture & Design** - Scalable systems, database schemas, API structures, component hierarchies
- **Complete Code Generation** - Production-ready code with TypeScript types, error handling, loading states
- **Live Preview Output** - Standalone HTML/CSS/JS for immediate visual preview

**Task Execution Protocol:**
1. **ANALYZE** - Parse requirements and identify deliverable type
2. **PLAN** - Break down into logical steps with optimal technologies
3. **RESEARCH** - Apply best practices and security considerations
4. **BUILD** - Generate complete, runnable code with all files
5. **DELIVER** - Present solution with key decisions and enhancement suggestions

**Agent Status Visualization:**
- Real-time progress indicators during task execution
- Task steps with running/complete status
- Animated thinking indicators and progress bars

### Replit Integrations

Pre-built integration modules in `server/replit_integrations/`:
- **chat/** - Conversation storage and streaming routes
- **audio/** - Voice recording, playback, speech-to-text, text-to-speech
- **image/** - AI image generation and editing
- **batch/** - Rate-limited batch processing with retries

## External Dependencies

### AI Services
- **OpenAI API** (via Replit AI Integrations) - Chat completions, image generation, TTS/STT
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Database
- **PostgreSQL** - Primary data store
- Environment variable: `DATABASE_URL`

### Key NPM Packages
- `drizzle-orm` / `drizzle-zod` - Type-safe database ORM with Zod validation
- `openai` - Official OpenAI SDK
- `expo` ecosystem - Cross-platform mobile/web framework
- `react-native-reanimated` - High-performance animations
- `@tanstack/react-query` - Server state management
- `p-limit` / `p-retry` - Rate limiting and retry logic for batch operations

### Development Tools
- TypeScript with strict mode
- ESLint with Expo and Prettier configurations
- Path aliases: `@/` maps to `./client`, `@shared/` maps to `./shared`