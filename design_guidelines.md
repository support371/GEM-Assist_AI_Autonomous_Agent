# AI Agent Builder - Design Guidelines

## Brand Identity

**Purpose**: An autonomous AI development assistant that transforms natural language requests into production-ready code. Built for developers who want to accelerate their workflow with intelligent code generation, debugging, and project management.

**Aesthetic Direction**: **Technical-Luxurious** - A premium developer tool that feels powerful yet approachable. Think high-end IDE meets conversational AI. The interface should convey computational sophistication through refined gradients, subtle animations, and precise typography, while maintaining the clarity needed for code-focused work.

**Memorable Element**: The **dual-panel intelligence** - a persistent split view where conversation flows on the left while generated code materializes and evolves on the right, creating a tangible sense of AI working in real-time.

---

## Navigation Architecture

**Root Structure**: Three-panel desktop layout (no mobile version)

### Main Panels
1. **Left Sidebar** (280px fixed) - Workspace navigation
2. **Center Panel** (flexible) - Agent conversation
3. **Right Panel** (flexible, 50% default) - Code preview/editor

### Screen Hierarchy

**Authenticated State**:
- Dashboard (workspace selection)
- Agent Workspace (main interface)
  - Conversation view (center)
  - Code editor view (right panel)
  - Settings modal
  - Project selector dropdown
  
**Unauthenticated State**:
- Landing page (marketing site)
- Login/Signup modal

---

## Screen Specifications

### Landing Page
**Purpose**: Convert visitors into users by showcasing AI agent capabilities

**Layout**:
- Transparent header with logo, nav links, CTA button (fixed on scroll)
- Hero section with animated gradient background
- Stats section (4-column grid)
- Features grid (4 columns desktop, 2 tablet, 1 mobile)
- CTA section with email capture
- Footer

**Components**:
- Gradient hero background with radial overlay
- Feature cards with icon, title, description (hover state: border color shift)
- Stat counter animations on scroll
- Email input with inline submit button

**Safe Areas**: Standard web margins (max-width: 1280px, px-4 sm:px-6 lg:px-8)

---

### Agent Workspace (Main Interface)

**Purpose**: Primary workspace where users interact with the AI agent and view results

**Layout**:
- **Header** (64px height): Project dropdown (left), execution status badge (center), settings icon (right)
- **Left Sidebar** (280px): Recent conversations list, new conversation button, workspace switcher at bottom
- **Center Panel**: Chat interface with message history, input field at bottom with floating send button
- **Right Panel**: Tabbed code preview (Preview, Code, Files, Logs tabs), device size toggles (mobile/tablet/desktop), fullscreen toggle

**Components**:
- Message bubbles (user: right-aligned with subtle background, agent: left-aligned with avatar)
- Code blocks with syntax highlighting, copy button, language badge
- Progress indicator for agent tasks (stepped progress bar)
- Tool call badges (colored by status: processing=blue, completed=green, error=red)
- Floating action button for new message (bottom-right of input)
- Split panel with draggable divider

**Safe Areas**: 
- Top: 64px (header height)
- Left: 280px (sidebar width)
- Bottom: 80px (input area)
- Right: 0 (full width available)

---

### Settings Modal
**Purpose**: Configure agent behavior, API keys, workspace preferences

**Layout**:
- Modal overlay (centered, 640px max-width)
- Tabbed interface: General, API Keys, Agent Settings, Billing
- Form sections with labels, inputs, helper text
- Save/Cancel buttons (bottom-right of modal)

**Components**:
- Tab navigation (underline indicator)
- Form inputs (text, select, toggle switches)
- API key input with show/hide toggle
- Success/error toast notifications

---

## Color Palette

**Background Hierarchy**:
- `background-primary`: #0F172A (slate-900) - Main canvas
- `background-secondary`: #1E293B (slate-800) - Elevated surfaces
- `background-tertiary`: #334155 (slate-700) - Hover states
- `background-overlay`: rgba(15, 23, 42, 0.95) - Modal backdrop

**Accent Colors**:
- `primary`: Linear gradient from #3B82F6 (blue-500) to #A855F7 (purple-500) - Primary actions, brand elements
- `success`: #10B981 (emerald-500) - Completed tasks
- `warning`: #F59E0B (amber-500) - Processing states
- `error`: #EF4444 (red-500) - Errors, failed tasks

**Text**:
- `text-primary`: #F8FAFC (slate-50) - Headings, primary content
- `text-secondary`: #94A3B8 (slate-400) - Body text, descriptions
- `text-tertiary`: #64748B (slate-500) - Metadata, timestamps
- `text-code`: #E2E8F0 (slate-200) - Code syntax base

**Borders**:
- `border-primary`: rgba(148, 163, 184, 0.1) - Subtle dividers
- `border-secondary`: rgba(148, 163, 184, 0.2) - Input borders
- `border-accent`: rgba(59, 130, 246, 0.5) - Focus states, active elements

---

## Typography

**Font Stack**:
- **UI Text**: 'Inter', system-ui, -apple-system, sans-serif
- **Code**: 'JetBrains Mono', 'Fira Code', Consolas, monospace

**Type Scale**:
- Display: 48px/56px, font-weight: 700 (landing hero)
- H1: 36px/44px, font-weight: 700 (page titles)
- H2: 30px/38px, font-weight: 600 (section headers)
- H3: 24px/32px, font-weight: 600 (card titles)
- Body: 16px/24px, font-weight: 400 (main content)
- Small: 14px/20px, font-weight: 400 (metadata)
- Code: 14px/20px, font-weight: 400 (code blocks)

---

## Visual Design

**Interaction Feedback**:
- Buttons: Opacity 0.9 on hover, scale(0.98) on active, smooth 150ms transition
- Cards: Border color shift on hover (from border-primary to border-accent), 200ms transition
- Inputs: Ring-2 with primary color on focus
- Code copy: Icon changes from Copy to Check with 150ms fade, reverts after 2s

**Shadows**:
- Floating elements (modals, dropdowns): 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)
- Button primary: 0 4px 14px 0 rgba(59, 130, 246, 0.25)

**Icons**: Use Lucide React icons throughout (size: 20px default, 24px for headers, 16px for inline)

---

## Assets to Generate

**Brand Assets**:
1. `logo-icon.svg` - AI sparkles icon in gradient (blue-500 to purple-500), used in header and loading states
2. `logo-full.svg` - Full wordmark with icon, used in landing page hero

**Illustrations**:
3. `empty-conversation.svg` - Abstract geometric pattern suggesting code structure, used in center panel when no messages
4. `empty-code.svg` - Terminal window with cursor, used in right panel when no code generated
5. `hero-background.svg` - Subtle grid pattern with gradient overlay, used in landing hero section
6. `success-animation.json` (Lottie) - Checkmark with particle burst, displayed when agent completes task

**State Indicators**:
7. `agent-avatar.svg` - Abstract AI icon (circuit pattern in circle), used for agent message bubbles
8. `processing-dots.svg` - Three animated dots, displayed during agent processing

**WHERE USED**:
- `logo-icon.svg`: Header (top-left), loading screen, favicon
- `logo-full.svg`: Landing page hero, login modal
- `empty-conversation.svg`: Center panel empty state
- `empty-code.svg`: Right panel empty state  
- `hero-background.svg`: Landing page hero section background
- `success-animation.json`: Toast notification for completed tasks, agent message completion
- `agent-avatar.svg`: All agent messages in conversation view
- `processing-dots.svg`: Agent message footer during active generation