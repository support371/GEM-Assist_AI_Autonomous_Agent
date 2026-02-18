#!/usr/bin/env python3
"""
/scaffold_assistloop_mvp.py

Generates a from-scratch AssistLoop-like MVP (NOT a copy of proprietary code):
- Next.js (App Router) web app
- NextAuth (Credentials) auth
- Prisma + Postgres
- WebSocket server for realtime chat
- Simple embed widget script
- OpenAI-powered agent replies (optional via OPENAI_API_KEY)

Requirements on your machine:
- Node.js 18+ (or 20+)
- PostgreSQL (or use Neon/Supabase)
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path


ROOT = Path("assistloop-mvp")


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> None:
    if ROOT.exists():
        raise SystemExit(f"Refusing to overwrite existing folder: {ROOT.resolve()}")

    # ----------------------------
    # Root configs
    # ----------------------------
    write(
        ROOT / "package.json",
        textwrap.dedent(
            """
            {
              "name": "assistloop-mvp",
              "private": true,
              "workspaces": [
                "apps/*",
                "packages/*"
              ],
              "scripts": {
                "dev": "concurrently -n web,ws -c auto \"pnpm -C apps/web dev\" \"pnpm -C apps/web ws\"",
                "build": "pnpm -C apps/web build",
                "start": "pnpm -C apps/web start",
                "lint": "pnpm -C apps/web lint",
                "format": "prettier -w ."
              },
              "devDependencies": {
                "concurrently": "^9.0.1",
                "prettier": "^3.3.3"
              }
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / ".prettierrc.json",
        textwrap.dedent(
            """
            {
              "singleQuote": true,
              "semi": true,
              "printWidth": 100
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / ".gitignore",
        textwrap.dedent(
            """
            node_modules
            .next
            dist
            .env
            .env.local
            .DS_Store
            *.log
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "README.md",
        textwrap.dedent(
            """
            # AssistLoop-like MVP (from scratch)

            This is an original MVP that *resembles* publicly visible features:
            - AI customer support widget
            - Knowledge base ingestion (basic)
            - Human handoff
            - Conversation history

            ## 1) Install
            ```bash
            corepack enable
            pnpm install
            ```

            ## 2) Configure env
            Create `apps/web/.env`:
            ```bash
            DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/assistloop_mvp"
            NEXTAUTH_URL="http://localhost:3000"
            NEXTAUTH_SECRET="replace-with-a-long-random-string"
            OPENAI_API_KEY=""   # optional; without it, agent uses a stub reply
            ```

            ## 3) Setup database
            ```bash
            pnpm -C apps/web prisma migrate dev --name init
            pnpm -C apps/web prisma db seed
            ```

            Seeds a demo user:
            - Email: demo@assistloop.local
            - Password: demo1234

            ## 4) Run dev
            ```bash
            pnpm dev
            ```
            - Web: http://localhost:3000
            - WS:  ws://localhost:3001

            ## 5) Embed widget
            In the dashboard -> Agent -> Widget, copy the snippet:
            ```html
            <script
              src="http://localhost:3000/widget.js"
              data-agent="AGENT_ID"
              data-host="http://localhost:3000"
              data-ws="ws://localhost:3001"
            ></script>
            ```

            ## Notes
            - This is a minimal, clean base you can expand:
              - URL scraping
              - PDF/DOCX ingestion
              - Vector search (pgvector)
              - Multi-channel connectors
              - Admin roles & teams
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # packages/shared
    # ----------------------------
    write(
        ROOT / "packages/shared/package.json",
        textwrap.dedent(
            """
            {
              "name": "@assistloop/shared",
              "version": "0.0.0",
              "private": true,
              "type": "module",
              "main": "src/index.ts"
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "packages/shared/src/index.ts",
        textwrap.dedent(
            """
            export type Role = 'user' | 'assistant' | 'human';

            export type WidgetInit = {
              agentId: string;
              host: string;
              ws: string;
            };

            export type WsClientHello = {
              type: 'hello';
              agentId: string;
              conversationId?: string;
              visitorId: string;
            };

            export type WsClientMessage = {
              type: 'message';
              conversationId: string;
              visitorId: string;
              text: string;
            };

            export type WsServerMessage =
              | { type: 'conversation'; conversationId: string }
              | { type: 'message'; role: Role; text: string; createdAt: string }
              | { type: 'handoff'; enabled: boolean }
              | { type: 'error'; message: string };
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # apps/web (Next.js)
    # ----------------------------
    write(
        ROOT / "apps/web/package.json",
        textwrap.dedent(
            """
            {
              "name": "web",
              "private": true,
              "scripts": {
                "dev": "next dev -p 3000",
                "build": "next build",
                "start": "next start -p 3000",
                "lint": "next lint",
                "ws": "tsx src/ws/server.ts",
                "prisma": "prisma",
                "seed": "tsx prisma/seed.ts"
              },
              "dependencies": {
                "@assistloop/shared": "workspace:*",
                "@prisma/client": "^5.19.1",
                "bcryptjs": "^2.4.3",
                "next": "^14.2.5",
                "next-auth": "^4.24.7",
                "openai": "^4.56.0",
                "react": "^18.3.1",
                "react-dom": "^18.3.1",
                "uuid": "^10.0.0",
                "ws": "^8.18.0",
                "zod": "^3.23.8"
              },
              "devDependencies": {
                "@types/bcryptjs": "^2.4.6",
                "@types/node": "^20.14.10",
                "@types/ws": "^8.5.12",
                "eslint": "^8.57.0",
                "eslint-config-next": "^14.2.5",
                "prisma": "^5.19.1",
                "tsx": "^4.16.2",
                "typescript": "^5.5.4"
              }
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/next.config.mjs",
        textwrap.dedent(
            """
            /** @type {import('next').NextConfig} */
            const nextConfig = {
              reactStrictMode: true
            };

            export default nextConfig;
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/tsconfig.json",
        textwrap.dedent(
            """
            {
              "compilerOptions": {
                "target": "ES2022",
                "lib": ["dom", "dom.iterable", "esnext"],
                "allowJs": false,
                "skipLibCheck": true,
                "strict": true,
                "noEmit": true,
                "esModuleInterop": true,
                "module": "esnext",
                "moduleResolution": "bundler",
                "resolveJsonModule": true,
                "isolatedModules": true,
                "jsx": "preserve",
                "incremental": true,
                "types": ["node"]
              },
              "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
              "exclude": ["node_modules"]
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/next-env.d.ts",
        "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n",
    )

    # ----------------------------
    # Prisma
    # ----------------------------
    write(
        ROOT / "apps/web/prisma/schema.prisma",
        textwrap.dedent(
            """
            generator client {
              provider = "prisma-client-js"
            }

            datasource db {
              provider = "postgresql"
              url      = env("DATABASE_URL")
            }

            model Organization {
              id        String   @id @default(cuid())
              name      String
              users     User[]
              agents    Agent[]
              createdAt DateTime @default(now())
            }

            model User {
              id             String   @id @default(cuid())
              email          String   @unique
              passwordHash   String
              organizationId String
              organization   Organization @relation(fields: [organizationId], references: [id])
              createdAt      DateTime @default(now())
            }

            model Agent {
              id             String   @id @default(cuid())
              organizationId String
              organization   Organization @relation(fields: [organizationId], references: [id])

              name           String
              widgetColor    String   @default("#111111")
              widgetTitle    String   @default("Support")
              handoffEnabled Boolean  @default(false)

              knowledgeItems KnowledgeItem[]
              conversations  Conversation[]
              createdAt      DateTime @default(now())
            }

            model KnowledgeItem {
              id        String   @id @default(cuid())
              agentId   String
              agent     Agent    @relation(fields: [agentId], references: [id])
              kind      String   // "text" | "url"
              content   String
              createdAt DateTime @default(now())
            }

            model Conversation {
              id         String   @id @default(cuid())
              agentId    String
              agent      Agent    @relation(fields: [agentId], references: [id])
              visitorId  String
              messages   Message[]
              createdAt  DateTime @default(now())
              updatedAt  DateTime @updatedAt
            }

            model Message {
              id             String   @id @default(cuid())
              conversationId String
              conversation   Conversation @relation(fields: [conversationId], references: [id])
              role           String   // "user" | "assistant" | "human"
              text           String
              createdAt      DateTime @default(now())
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/prisma/seed.ts",
        textwrap.dedent(
            """
            import bcrypt from 'bcryptjs';
            import { prisma } from '../src/server/prisma';

            async function main() {
              const org = await prisma.organization.create({
                data: { name: 'Demo Org' }
              });

              const passwordHash = await bcrypt.hash('demo1234', 10);

              await prisma.user.create({
                data: {
                  email: 'demo@assistloop.local',
                  passwordHash,
                  organizationId: org.id
                }
              });

              await prisma.agent.create({
                data: {
                  name: 'Demo Agent',
                  organizationId: org.id,
                  widgetTitle: 'Ask us anything',
                  widgetColor: '#111111',
                  knowledgeItems: {
                    create: [
                      { kind: 'text', content: 'Refunds are available within 14 days with a receipt.' },
                      { kind: 'text', content: 'Support hours: Mon-Fri 9am-5pm ET.' }
                    ]
                  }
                }
              });

              console.log('Seed complete: demo@assistloop.local / demo1234');
            }

            main()
              .catch((e) => {
                console.error(e);
                process.exit(1);
              })
              .finally(async () => {
                await prisma.$disconnect();
              });
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # Server utilities
    # ----------------------------
    write(
        ROOT / "apps/web/src/server/prisma.ts",
        textwrap.dedent(
            """
            import { PrismaClient } from '@prisma/client';

            declare global {
              // eslint-disable-next-line no-var
              var prisma: PrismaClient | undefined;
            }

            export const prisma =
              global.prisma ??
              new PrismaClient({
                log: ['error', 'warn']
              });

            if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/server/auth.ts",
        textwrap.dedent(
            """
            import type { NextAuthOptions } from 'next-auth';
            import CredentialsProvider from 'next-auth/providers/credentials';
            import bcrypt from 'bcryptjs';
            import { prisma } from './prisma';
            import { z } from 'zod';

            const credsSchema = z.object({
              email: z.string().email(),
              password: z.string().min(4)
            });

            export const authOptions: NextAuthOptions = {
              session: { strategy: 'jwt' },
              providers: [
                CredentialsProvider({
                  name: 'Credentials',
                  credentials: {
                    email: { label: 'Email', type: 'email' },
                    password: { label: 'Password', type: 'password' }
                  },
                  async authorize(credentials) {
                    const parsed = credsSchema.safeParse(credentials);
                    if (!parsed.success) return null;

                    const user = await prisma.user.findUnique({
                      where: { email: parsed.data.email }
                    });
                    if (!user) return null;

                    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
                    if (!ok) return null;

                    return {
                      id: user.id,
                      email: user.email,
                      orgId: user.organizationId
                    } as any;
                  }
                })
              ],
              callbacks: {
                async jwt({ token, user }) {
                  if (user) {
                    token.sub = (user as any).id;
                    (token as any).orgId = (user as any).orgId;
                  }
                  return token;
                },
                async session({ session, token }) {
                  (session as any).userId = token.sub;
                  (session as any).orgId = (token as any).orgId;
                  return session;
                }
              }
            };
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/server/ai.ts",
        textwrap.dedent(
            """
            import OpenAI from 'openai';
            import { prisma } from './prisma';

            function getClient(): OpenAI | null {
              const key = process.env.OPENAI_API_KEY;
              if (!key) return null;
              return new OpenAI({ apiKey: key });
            }

            export async function generateAgentReply(opts: {
              agentId: string;
              conversationId: string;
              userText: string;
            }): Promise<string> {
              const agent = await prisma.agent.findUnique({
                where: { id: opts.agentId },
                include: { knowledgeItems: true }
              });
              if (!agent) return 'Sorry—this agent was not found.';

              const kb = agent.knowledgeItems
                .map((k) => `- (${k.kind}) ${k.content}`)
                .slice(0, 20)
                .join('\\n');

              const client = getClient();
              if (!client) {
                return `Got it. (Stub reply) You said: "${opts.userText}".`;
              }

              const system = [
                `You are a customer support AI for the business using this widget.`,
                `Be concise, helpful, and ask clarifying questions if needed.`,
                `If the answer is not in the knowledge base, say you are not sure and offer to hand off to a human.`,
                `Knowledge base:`,
                kb || '(empty)'
              ].join('\\n');

              const resp = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: opts.userText }
                ],
                temperature: 0.3
              });

              return resp.choices[0]?.message?.content?.trim() || "Sorry, I couldn't generate a reply.";
            }
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # WebSocket server
    # ----------------------------
    write(
        ROOT / "apps/web/src/ws/server.ts",
        textwrap.dedent(
            """
            import { WebSocketServer } from 'ws';
            import { v4 as uuidv4 } from 'uuid';
            import { prisma } from '../server/prisma';
            import { generateAgentReply } from '../server/ai';
            import type { WsClientHello, WsClientMessage, WsServerMessage } from '@assistloop/shared';

            const PORT = Number(process.env.WS_PORT || 3001);

            type ClientMeta = {
              agentId: string;
              conversationId: string;
              visitorId: string;
            };

            const wss = new WebSocketServer({ port: PORT });
            const clients = new Map<any, ClientMeta>();

            function send(ws: any, msg: WsServerMessage) {
              ws.send(JSON.stringify(msg));
            }

            function broadcastToConversation(conversationId: string, msg: WsServerMessage) {
              for (const [ws, meta] of clients.entries()) {
                if (meta.conversationId === conversationId) send(ws, msg);
              }
            }

            wss.on('connection', (ws) => {
              ws.on('message', async (raw) => {
                let data: any;
                try {
                  data = JSON.parse(raw.toString());
                } catch {
                  send(ws, { type: 'error', message: 'Invalid JSON' });
                  return;
                }

                if (data?.type === 'hello') {
                  const hello = data as WsClientHello;
                  const agent = await prisma.agent.findUnique({ where: { id: hello.agentId } });
                  if (!agent) {
                    send(ws, { type: 'error', message: 'Agent not found' });
                    return;
                  }

                  const conversation =
                    hello.conversationId
                      ? await prisma.conversation.findUnique({ where: { id: hello.conversationId } })
                      : null;

                  const convo =
                    conversation ??
                    (await prisma.conversation.create({
                      data: {
                        agentId: hello.agentId,
                        visitorId: hello.visitorId || uuidv4()
                      }
                    }));

                  clients.set(ws, {
                    agentId: hello.agentId,
                    conversationId: convo.id,
                    visitorId: hello.visitorId
                  });

                  send(ws, { type: 'conversation', conversationId: convo.id });
                  send(ws, { type: 'handoff', enabled: agent.handoffEnabled });

                  const history = await prisma.message.findMany({
                    where: { conversationId: convo.id },
                    orderBy: { createdAt: 'asc' },
                    take: 50
                  });

                  for (const m of history) {
                    send(ws, { type: 'message', role: m.role as any, text: m.text, createdAt: m.createdAt.toISOString() });
                  }

                  return;
                }

                if (data?.type === 'message') {
                  const meta = clients.get(ws);
                  if (!meta) {
                    send(ws, { type: 'error', message: 'Send hello first' });
                    return;
                  }

                  const msg = data as WsClientMessage;
                  if (!msg.text?.trim()) return;

                  const agent = await prisma.agent.findUnique({ where: { id: meta.agentId } });
                  if (!agent) {
                    send(ws, { type: 'error', message: 'Agent not found' });
                    return;
                  }

                  const userMessage = await prisma.message.create({
                    data: {
                      conversationId: meta.conversationId,
                      role: 'user',
                      text: msg.text.trim()
                    }
                  });

                  broadcastToConversation(meta.conversationId, {
                    type: 'message',
                    role: 'user',
                    text: userMessage.text,
                    createdAt: userMessage.createdAt.toISOString()
                  });

                  if (agent.handoffEnabled) {
                    return;
                  }

                  const replyText = await generateAgentReply({
                    agentId: meta.agentId,
                    conversationId: meta.conversationId,
                    userText: userMessage.text
                  });

                  const botMessage = await prisma.message.create({
                    data: {
                      conversationId: meta.conversationId,
                      role: 'assistant',
                      text: replyText
                    }
                  });

                  broadcastToConversation(meta.conversationId, {
                    type: 'message',
                    role: 'assistant',
                    text: botMessage.text,
                    createdAt: botMessage.createdAt.toISOString()
                  });

                  return;
                }

                send(ws, { type: 'error', message: 'Unknown message type' });
              });

              ws.on('close', () => {
                clients.delete(ws);
              });
            });

            // eslint-disable-next-line no-console
            console.log(`WS server listening on ws://localhost:${PORT}`);
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # Next.js App Router
    # ----------------------------
    write(
        ROOT / "apps/web/src/app/layout.tsx",
        textwrap.dedent(
            """
            import './globals.css';
            import type { ReactNode } from 'react';

            export const metadata = {
              title: 'AssistLoop MVP',
              description: 'AI customer support widget with human handoff'
            };

            export default function RootLayout({ children }: { children: ReactNode }) {
              return (
                <html lang="en">
                  <body>{children}</body>
                </html>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/globals.css",
        textwrap.dedent(
            """
            :root { color-scheme: light; }
            body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; }
            a { color: inherit; text-decoration: none; }
            .container { max-width: 1040px; margin: 0 auto; padding: 24px; }
            .nav { display: flex; gap: 14px; align-items: center; justify-content: space-between; }
            .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 16px; }
            .btn { padding: 10px 12px; border-radius: 10px; border: 1px solid #ddd; background: #111; color: #fff; cursor: pointer; }
            .btn.secondary { background: #fff; color: #111; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
            input, textarea { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #ddd; }
            label { display: block; font-size: 12px; color: #444; margin-bottom: 6px; }
            .row { display: grid; gap: 10px; }
            """
        ).strip()
        + "\n",
    )

    # Marketing
    write(
        ROOT / "apps/web/src/app/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';

            export default function HomePage() {
              return (
                <div className="container">
                  <div className="nav">
                    <strong>AssistLoop MVP</strong>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Link href="/features">Features</Link>
                      <Link href="/pricing">Pricing</Link>
                      <Link href="/login">Login</Link>
                    </div>
                  </div>

                  <div style={{ padding: '48px 0' }}>
                    <h1 style={{ fontSize: 44, margin: 0 }}>AI Customer Support + Human Handoff</h1>
                    <p style={{ fontSize: 18, color: '#444', maxWidth: 720 }}>
                      Instant answers from your knowledge base, with seamless handoff to your team and conversation history.
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Link className="btn" href="/login">Try Demo Login</Link>
                      <a className="btn secondary" href="/widget-demo">Widget Demo</a>
                    </div>
                  </div>

                  <div className="grid">
                    <div className="card">
                      <h3>Customize widget</h3>
                      <p style={{ color: '#444' }}>Title + color, simple embed snippet.</p>
                    </div>
                    <div className="card">
                      <h3>Train on your data</h3>
                      <p style={{ color: '#444' }}>Add KB text now; extend to URLs/files later.</p>
                    </div>
                    <div className="card">
                      <h3>Conversation history</h3>
                      <p style={{ color: '#444' }}>Review chats, toggle handoff mode.</p>
                    </div>
                  </div>

                  <p style={{ marginTop: 40, color: '#666' }}>
                    This is an original MVP scaffold. Not affiliated with AssistLoop.ai.
                  </p>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/features/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';

            export default function Features() {
              return (
                <div className="container">
                  <div className="nav">
                    <Link href="/"><strong>AssistLoop MVP</strong></Link>
                    <Link href="/login">Login</Link>
                  </div>
                  <h1>Features</h1>
                  <ul>
                    <li>Widget customization</li>
                    <li>Knowledge base text items</li>
                    <li>AI replies (optional OpenAI key)</li>
                    <li>Human handoff toggle</li>
                    <li>Conversation history</li>
                  </ul>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/pricing/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';

            export default function Pricing() {
              return (
                <div className="container">
                  <div className="nav">
                    <Link href="/"><strong>AssistLoop MVP</strong></Link>
                    <Link href="/login">Login</Link>
                  </div>
                  <h1>Pricing (placeholder)</h1>
                  <div className="grid">
                    <div className="card">
                      <h3>Free</h3>
                      <p style={{ color: '#444' }}>Great for trying it out.</p>
                    </div>
                    <div className="card">
                      <h3>Starter</h3>
                      <p style={{ color: '#444' }}>For small teams.</p>
                    </div>
                    <div className="card">
                      <h3>Pro</h3>
                      <p style={{ color: '#444' }}>Advanced features.</p>
                    </div>
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    # Auth pages
    write(
        ROOT / "apps/web/src/app/login/page.tsx",
        textwrap.dedent(
            """
            'use client';

            import { signIn } from 'next-auth/react';
            import { useState } from 'react';
            import Link from 'next/link';

            export default function LoginPage() {
              const [email, setEmail] = useState('demo@assistloop.local');
              const [password, setPassword] = useState('demo1234');
              const [error, setError] = useState<string | null>(null);

              async function onSubmit(e: React.FormEvent) {
                e.preventDefault();
                setError(null);
                const res = await signIn('credentials', {
                  email,
                  password,
                  redirect: true,
                  callbackUrl: '/app'
                });
                if ((res as any)?.error) setError('Invalid login');
              }

              return (
                <div className="container" style={{ maxWidth: 520 }}>
                  <div className="nav">
                    <Link href="/"><strong>AssistLoop MVP</strong></Link>
                    <Link href="/">Home</Link>
                  </div>

                  <h1>Login</h1>
                  <form className="card row" onSubmit={onSubmit}>
                    <div>
                      <label>Email</label>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <label>Password</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
                    <button className="btn" type="submit">Sign in</button>
                  </form>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    # NextAuth route
    write(
        ROOT / "apps/web/src/app/api/auth/[...nextauth]/route.ts",
        textwrap.dedent(
            """
            import NextAuth from 'next-auth';
            import { authOptions } from '../../../../server/auth';

            const handler = NextAuth(authOptions);
            export { handler as GET, handler as POST };
            """
        ).strip()
        + "\n",
    )

    # App (protected-ish via simple session check client-side)
    write(
        ROOT / "apps/web/src/app/app/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';
            import { prisma } from '../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../server/auth';

            export default async function AppHome() {
              const session = await getServerSession(authOptions);
              if (!session) {
                return (
                  <div className="container">
                    <p>You are not logged in.</p>
                    <Link className="btn" href="/login">Go to login</Link>
                  </div>
                );
              }

              const orgId = (session as any).orgId as string;
              const agents = await prisma.agent.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'desc' }
              });

              return (
                <div className="container">
                  <div className="nav">
                    <strong>Dashboard</strong>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Link href="/app/agents/new">New Agent</Link>
                      <Link href="/api/auth/signout">Sign out</Link>
                    </div>
                  </div>

                  <h1>Your Agents</h1>
                  <div className="grid">
                    {agents.map((a) => (
                      <Link key={a.id} href={`/app/agents/${a.id}`}>
                        <div className="card">
                          <h3 style={{ marginTop: 0 }}>{a.name}</h3>
                          <p style={{ color: '#444' }}>Widget: {a.widgetTitle}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/agents/new/page.tsx",
        textwrap.dedent(
            """
            'use client';

            import { useState } from 'react';
            import { useRouter } from 'next/navigation';
            import Link from 'next/link';

            export default function NewAgentPage() {
              const router = useRouter();
              const [name, setName] = useState('My Agent');

              async function create() {
                const res = await fetch('/api/agents', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name })
                });
                if (!res.ok) return;
                const data = await res.json();
                router.push(`/app/agents/${data.id}`);
              }

              return (
                <div className="container" style={{ maxWidth: 720 }}>
                  <div className="nav">
                    <Link href="/app"><strong>Dashboard</strong></Link>
                    <Link href="/app">Back</Link>
                  </div>

                  <h1>Create Agent</h1>
                  <div className="card row">
                    <div>
                      <label>Name</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <button className="btn" onClick={create}>Create</button>
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/agents/[id]/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';
            import { prisma } from '../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../server/auth';

            export default async function AgentPage({ params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) {
                return (
                  <div className="container">
                    <p>You are not logged in.</p>
                    <Link className="btn" href="/login">Go to login</Link>
                  </div>
                );
              }

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId },
                include: {
                  knowledgeItems: { orderBy: { createdAt: 'desc' }, take: 50 },
                  conversations: { orderBy: { updatedAt: 'desc' }, take: 20 }
                }
              });

              if (!agent) {
                return (
                  <div className="container">
                    <p>Agent not found.</p>
                    <Link href="/app">Back</Link>
                  </div>
                );
              }

              return (
                <div className="container">
                  <div className="nav">
                    <Link href="/app"><strong>Dashboard</strong></Link>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Link href={`/app/agents/${agent.id}/widget`}>Widget</Link>
                      <Link href={`/app/agents/${agent.id}/conversations`}>Conversations</Link>
                    </div>
                  </div>

                  <h1>{agent.name}</h1>

                  <div className="grid">
                    <div className="card">
                      <h3>Widget Settings</h3>
                      <p style={{ color: '#444' }}>Title: {agent.widgetTitle}</p>
                      <p style={{ color: '#444' }}>Color: {agent.widgetColor}</p>
                      <p style={{ color: '#444' }}>Handoff: {agent.handoffEnabled ? 'ON' : 'OFF'}</p>
                      <Link className="btn secondary" href={`/app/agents/${agent.id}/widget`}>Edit widget</Link>
                    </div>

                    <div className="card">
                      <h3>Knowledge Base</h3>
                      <p style={{ color: '#444' }}>Items: {agent.knowledgeItems.length}</p>
                      <Link className="btn secondary" href={`/app/agents/${agent.id}/kb`}>Manage KB</Link>
                    </div>

                    <div className="card">
                      <h3>Recent Conversations</h3>
                      <p style={{ color: '#444' }}>Latest: {agent.conversations[0]?.updatedAt.toISOString() ?? '—'}</p>
                      <Link className="btn secondary" href={`/app/agents/${agent.id}/conversations`}>Open</Link>
                    </div>
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/agents/[id]/kb/page.tsx",
        textwrap.dedent(
            """
            'use client';

            import { useEffect, useState } from 'react';
            import Link from 'next/link';

            type KB = { id: string; kind: string; content: string; createdAt: string };

            export default function KbPage({ params }: { params: { id: string } }) {
              const [items, setItems] = useState<KB[]>([]);
              const [text, setText] = useState('');
              const [url, setUrl] = useState('');

              async function load() {
                const res = await fetch(`/api/agents/${params.id}/kb`);
                if (!res.ok) return;
                setItems(await res.json());
              }

              useEffect(() => {
                void load();
                // eslint-disable-next-line react-hooks/exhaustive-deps
              }, []);

              async function add(kind: 'text' | 'url', content: string) {
                const res = await fetch(`/api/agents/${params.id}/kb`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ kind, content })
                });
                if (!res.ok) return;
                setText('');
                setUrl('');
                await load();
              }

              async function remove(id: string) {
                const res = await fetch(`/api/agents/${params.id}/kb/${id}`, { method: 'DELETE' });
                if (!res.ok) return;
                await load();
              }

              return (
                <div className="container" style={{ maxWidth: 900 }}>
                  <div className="nav">
                    <Link href={`/app/agents/${params.id}`}><strong>Agent</strong></Link>
                    <Link href={`/app/agents/${params.id}`}>Back</Link>
                  </div>

                  <h1>Knowledge Base</h1>

                  <div className="grid">
                    <div className="card row">
                      <h3 style={{ marginTop: 0 }}>Add text</h3>
                      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
                      <button className="btn" onClick={() => add('text', text)}>Add</button>
                    </div>

                    <div className="card row">
                      <h3 style={{ marginTop: 0 }}>Add URL (placeholder)</h3>
                      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/help" />
                      <button className="btn" onClick={() => add('url', url)}>Add</button>
                      <p style={{ color: '#666', margin: 0 }}>
                        URL scraping not implemented yet—this stores the URL and you can add a scraper later.
                      </p>
                    </div>
                  </div>

                  <h2 style={{ marginTop: 24 }}>Items</h2>
                  <div className="row">
                    {items.map((i) => (
                      <div key={i.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <strong>{i.kind}</strong>
                            <p style={{ color: '#444', whiteSpace: 'pre-wrap' }}>{i.content}</p>
                            <small style={{ color: '#666' }}>{new Date(i.createdAt).toLocaleString()}</small>
                          </div>
                          <button className="btn secondary" onClick={() => remove(i.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/agents/[id]/widget/page.tsx",
        textwrap.dedent(
            """
            'use client';

            import { useEffect, useMemo, useState } from 'react';
            import Link from 'next/link';

            type Agent = { id: string; widgetTitle: string; widgetColor: string; handoffEnabled: boolean };

            export default function WidgetPage({ params }: { params: { id: string } }) {
              const [agent, setAgent] = useState<Agent | null>(null);
              const [title, setTitle] = useState('');
              const [color, setColor] = useState('#111111');
              const [handoff, setHandoff] = useState(false);

              async function load() {
                const res = await fetch(`/api/agents/${params.id}`);
                if (!res.ok) return;
                const a = (await res.json()) as Agent;
                setAgent(a);
                setTitle(a.widgetTitle);
                setColor(a.widgetColor);
                setHandoff(a.handoffEnabled);
              }

              useEffect(() => { void load(); }, []);

              async function save() {
                const res = await fetch(`/api/agents/${params.id}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ widgetTitle: title, widgetColor: color, handoffEnabled: handoff })
                });
                if (!res.ok) return;
                await load();
              }

              const snippet = useMemo(() => {
                const host = 'http://localhost:3000';
                const ws = 'ws://localhost:3001';
                return `<script\\n  src="${host}/widget.js"\\n  data-agent="${params.id}"\\n  data-host="${host}"\\n  data-ws="${ws}"\\n></script>`;
              }, [params.id]);

              return (
                <div className="container" style={{ maxWidth: 900 }}>
                  <div className="nav">
                    <Link href={`/app/agents/${params.id}`}><strong>Agent</strong></Link>
                    <Link href={`/app/agents/${params.id}`}>Back</Link>
                  </div>

                  <h1>Widget</h1>

                  <div className="grid">
                    <div className="card row">
                      <h3 style={{ marginTop: 0 }}>Settings</h3>
                      <div>
                        <label>Widget title</label>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} />
                      </div>
                      <div>
                        <label>Widget color</label>
                        <input value={color} onChange={(e) => setColor(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />
                        <span>Enable human handoff (AI will stop replying)</span>
                      </div>
                      <button className="btn" onClick={save}>Save</button>
                      {agent ? <p style={{ color: '#666', margin: 0 }}>Agent: {agent.id}</p> : null}
                    </div>

                    <div className="card row">
                      <h3 style={{ marginTop: 0 }}>Embed snippet</h3>
                      <textarea rows={7} readOnly value={snippet} />
                      <p style={{ color: '#666', margin: 0 }}>
                        Paste this right before <code>{'</body>'}</code> on your website.
                      </p>
                      <Link className="btn secondary" href="/widget-demo">Open local widget demo</Link>
                    </div>
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/agents/[id]/conversations/page.tsx",
        textwrap.dedent(
            """
            import Link from 'next/link';
            import { prisma } from '../../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../../server/auth';

            export default async function Conversations({ params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) {
                return (
                  <div className="container">
                    <p>You are not logged in.</p>
                    <Link className="btn" href="/login">Go to login</Link>
                  </div>
                );
              }

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId }
              });

              if (!agent) {
                return (
                  <div className="container">
                    <p>Agent not found.</p>
                    <Link href="/app">Back</Link>
                  </div>
                );
              }

              const conversations = await prisma.conversation.findMany({
                where: { agentId: agent.id },
                orderBy: { updatedAt: 'desc' },
                take: 50
              });

              return (
                <div className="container" style={{ maxWidth: 900 }}>
                  <div className="nav">
                    <Link href={`/app/agents/${params.id}`}><strong>Agent</strong></Link>
                    <Link href={`/app/agents/${params.id}`}>Back</Link>
                  </div>

                  <h1>Conversations</h1>
                  <div className="row">
                    {conversations.map((c) => (
                      <Link key={c.id} href={`/app/conversations/${c.id}`}>
                        <div className="card">
                          <strong>{c.id}</strong>
                          <p style={{ color: '#444' }}>Visitor: {c.visitorId}</p>
                          <small style={{ color: '#666' }}>{c.updatedAt.toISOString()}</small>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/app/conversations/[id]/page.tsx",
        textwrap.dedent(
            """
            'use client';

            import { useEffect, useState } from 'react';
            import Link from 'next/link';

            type Msg = { id: string; role: string; text: string; createdAt: string };
            type Convo = { id: string; agentId: string; visitorId: string; messages: Msg[]; agent: { name: string } };

            export default function ConversationPage({ params }: { params: { id: string } }) {
              const [convo, setConvo] = useState<Convo | null>(null);
              const [text, setText] = useState('');

              async function load() {
                const res = await fetch(`/api/conversations/${params.id}`);
                if (!res.ok) return;
                setConvo(await res.json());
              }

              useEffect(() => { void load(); }, []);

              async function sendHuman() {
                if (!text.trim()) return;
                const res = await fetch(`/api/conversations/${params.id}/human`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ text: text.trim() })
                });
                if (!res.ok) return;
                setText('');
                await load();
              }

              if (!convo) {
                return (
                  <div className="container">
                    <p>Loading…</p>
                  </div>
                );
              }

              return (
                <div className="container" style={{ maxWidth: 900 }}>
                  <div className="nav">
                    <Link href={`/app/agents/${convo.agentId}`}><strong>{convo.agent.name}</strong></Link>
                    <Link href={`/app/agents/${convo.agentId}/conversations`}>Back</Link>
                  </div>

                  <h1>Conversation</h1>
                  <p style={{ color: '#444' }}>Visitor: {convo.visitorId}</p>

                  <div className="row">
                    {convo.messages.map((m) => (
                      <div key={m.id} className="card">
                        <strong>{m.role}</strong>
                        <p style={{ color: '#444', whiteSpace: 'pre-wrap' }}>{m.text}</p>
                        <small style={{ color: '#666' }}>{new Date(m.createdAt).toLocaleString()}</small>
                      </div>
                    ))}
                  </div>

                  <div className="card row" style={{ marginTop: 16 }}>
                    <h3 style={{ margin: 0 }}>Send as human</h3>
                    <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
                    <button className="btn" onClick={sendHuman}>Send</button>
                    <p style={{ color: '#666', margin: 0 }}>
                      Tip: Toggle “human handoff” in Widget settings so the AI stops replying in the widget.
                    </p>
                  </div>
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    # Widget demo page
    write(
        ROOT / "apps/web/src/app/widget-demo/page.tsx",
        textwrap.dedent(
            """
            import Script from 'next/script';
            import { prisma } from '../../server/prisma';

            export default async function WidgetDemo() {
              const agent = await prisma.agent.findFirst({ orderBy: { createdAt: 'asc' } });

              return (
                <div className="container">
                  <h1>Widget Demo</h1>
                  <p style={{ color: '#444' }}>
                    This page injects <code>/widget.js</code> for the first agent in the database.
                  </p>
                  <p>
                    Open the dashboard to get the exact snippet for your agent.
                  </p>

                  {agent ? (
                    <Script
                      src="/widget.js"
                      data-agent={agent.id}
                      data-host="http://localhost:3000"
                      data-ws="ws://localhost:3001"
                      strategy="afterInteractive"
                    />
                  ) : (
                    <p>No agent found. Run prisma seed.</p>
                  )}
                </div>
              );
            }
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # API routes
    # ----------------------------
    write(
        ROOT / "apps/web/src/app/api/agents/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../server/auth';
            import { NextResponse } from 'next/server';
            import { z } from 'zod';

            const createSchema = z.object({
              name: z.string().min(1).max(80)
            });

            export async function POST(req: Request) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const body = await req.json().catch(() => null);
              const parsed = createSchema.safeParse(body);
              if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.create({
                data: { name: parsed.data.name, organizationId: orgId }
              });

              return NextResponse.json({ id: agent.id });
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/api/agents/[id]/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../server/auth';
            import { NextResponse } from 'next/server';
            import { z } from 'zod';

            const patchSchema = z.object({
              widgetTitle: z.string().min(1).max(80).optional(),
              widgetColor: z.string().min(4).max(20).optional(),
              handoffEnabled: z.boolean().optional()
            });

            export async function GET(_: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId },
                select: { id: true, widgetTitle: true, widgetColor: true, handoffEnabled: true }
              });

              if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
              return NextResponse.json(agent);
            }

            export async function PATCH(req: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;
              const body = await req.json().catch(() => null);
              const parsed = patchSchema.safeParse(body);
              if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

              const agent = await prisma.agent.findFirst({ where: { id: params.id, organizationId: orgId } });
              if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

              const updated = await prisma.agent.update({
                where: { id: agent.id },
                data: parsed.data
              });

              return NextResponse.json({ ok: true, id: updated.id });
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/api/agents/[id]/kb/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../../server/auth';
            import { NextResponse } from 'next/server';
            import { z } from 'zod';

            const createSchema = z.object({
              kind: z.enum(['text', 'url']),
              content: z.string().min(1).max(8000)
            });

            export async function GET(_: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId }
              });

              if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

              const items = await prisma.knowledgeItem.findMany({
                where: { agentId: agent.id },
                orderBy: { createdAt: 'desc' },
                take: 100
              });

              return NextResponse.json(items);
            }

            export async function POST(req: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId }
              });

              if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

              const body = await req.json().catch(() => null);
              const parsed = createSchema.safeParse(body);
              if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

              const item = await prisma.knowledgeItem.create({
                data: { agentId: agent.id, kind: parsed.data.kind, content: parsed.data.content }
              });

              return NextResponse.json(item);
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/api/agents/[id]/kb/[kid]/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../../../server/auth';
            import { NextResponse } from 'next/server';

            export async function DELETE(_: Request, { params }: { params: { id: string; kid: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const agent = await prisma.agent.findFirst({
                where: { id: params.id, organizationId: orgId }
              });

              if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

              await prisma.knowledgeItem.deleteMany({
                where: { id: params.kid, agentId: agent.id }
              });

              return NextResponse.json({ ok: true });
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/api/conversations/[id]/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../../server/auth';
            import { NextResponse } from 'next/server';

            export async function GET(_: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const convo = await prisma.conversation.findUnique({
                where: { id: params.id },
                include: {
                  agent: { select: { id: true, name: true, organizationId: true } },
                  messages: { orderBy: { createdAt: 'asc' }, take: 200 }
                }
              });

              if (!convo || convo.agent.organizationId !== orgId) {
                return NextResponse.json({ error: 'not_found' }, { status: 404 });
              }

              return NextResponse.json(convo);
            }
            """
        ).strip()
        + "\n",
    )

    write(
        ROOT / "apps/web/src/app/api/conversations/[id]/human/route.ts",
        textwrap.dedent(
            """
            import { prisma } from '../../../../../../server/prisma';
            import { getServerSession } from 'next-auth';
            import { authOptions } from '../../../../../../server/auth';
            import { NextResponse } from 'next/server';
            import { z } from 'zod';

            const schema = z.object({ text: z.string().min(1).max(4000) });

            export async function POST(req: Request, { params }: { params: { id: string } }) {
              const session = await getServerSession(authOptions);
              if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

              const orgId = (session as any).orgId as string;

              const convo = await prisma.conversation.findUnique({
                where: { id: params.id },
                include: { agent: true }
              });

              if (!convo || convo.agent.organizationId !== orgId) {
                return NextResponse.json({ error: 'not_found' }, { status: 404 });
              }

              const body = await req.json().catch(() => null);
              const parsed = schema.safeParse(body);
              if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

              await prisma.message.create({
                data: {
                  conversationId: convo.id,
                  role: 'human',
                  text: parsed.data.text
                }
              });

              return NextResponse.json({ ok: true });
            }
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # Serve widget.js
    # ----------------------------
    write(
        ROOT / "apps/web/src/app/widget.js/route.ts",
        textwrap.dedent(
            """
            import { NextResponse } from 'next/server';

            const WIDGET_JS = `
            (function () {
              function getAttr(script, name, fallback) {
                return script.getAttribute(name) || fallback;
              }

              var script = document.currentScript;
              if (!script) return;

              var agentId = getAttr(script, 'data-agent', '');
              var host = getAttr(script, 'data-host', window.location.origin);
              var wsUrl = getAttr(script, 'data-ws', 'ws://localhost:3001');

              if (!agentId) {
                console.error('[AssistLoop MVP] Missing data-agent');
                return;
              }

              var visitorKey = 'assistloop_visitor_id';
              var visitorId = localStorage.getItem(visitorKey);
              if (!visitorId) {
                visitorId = 'v_' + Math.random().toString(16).slice(2);
                localStorage.setItem(visitorKey, visitorId);
              }

              var convoKey = 'assistloop_convo_' + agentId;
              var conversationId = localStorage.getItem(convoKey) || '';

              // UI
              var btn = document.createElement('button');
              btn.innerText = 'Chat';
              btn.style.position = 'fixed';
              btn.style.right = '18px';
              btn.style.bottom = '18px';
              btn.style.zIndex = 2147483647;
              btn.style.border = '1px solid rgba(0,0,0,0.12)';
              btn.style.borderRadius = '999px';
              btn.style.padding = '12px 14px';
              btn.style.cursor = 'pointer';
              btn.style.background = '#111';
              btn.style.color = '#fff';
              document.body.appendChild(btn);

              var panel = document.createElement('div');
              panel.style.position = 'fixed';
              panel.style.right = '18px';
              panel.style.bottom = '72px';
              panel.style.width = '340px';
              panel.style.height = '420px';
              panel.style.background = '#fff';
              panel.style.border = '1px solid rgba(0,0,0,0.12)';
              panel.style.borderRadius = '14px';
              panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.16)';
              panel.style.zIndex = 2147483647;
              panel.style.display = 'none';
              panel.style.overflow = 'hidden';
              panel.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
              document.body.appendChild(panel);

              var header = document.createElement('div');
              header.style.padding = '12px';
              header.style.borderBottom = '1px solid rgba(0,0,0,0.08)';
              header.style.display = 'flex';
              header.style.justifyContent = 'space-between';
              header.style.alignItems = 'center';
              header.innerHTML = '<strong style="font-size:14px">Support</strong><span style="font-size:12px;color:#666" id="assistloop_status">connecting…</span>';
              panel.appendChild(header);

              var messages = document.createElement('div');
              messages.style.padding = '12px';
              messages.style.height = '316px';
              messages.style.overflowY = 'auto';
              messages.style.display = 'flex';
              messages.style.flexDirection = 'column';
              messages.style.gap = '10px';
              panel.appendChild(messages);

              var composer = document.createElement('div');
              composer.style.borderTop = '1px solid rgba(0,0,0,0.08)';
              composer.style.display = 'flex';
              composer.style.gap = '8px';
              composer.style.padding = '10px';
              panel.appendChild(composer);

              var input = document.createElement('input');
              input.placeholder = 'Type a message…';
              input.style.flex = '1';
              input.style.padding = '10px';
              input.style.border = '1px solid rgba(0,0,0,0.12)';
              input.style.borderRadius = '10px';
              composer.appendChild(input);

              var sendBtn = document.createElement('button');
              sendBtn.innerText = 'Send';
              sendBtn.style.padding = '10px 12px';
              sendBtn.style.borderRadius = '10px';
              sendBtn.style.border = '1px solid rgba(0,0,0,0.12)';
              sendBtn.style.cursor = 'pointer';
              sendBtn.style.background = '#111';
              sendBtn.style.color = '#fff';
              composer.appendChild(sendBtn);

              function bubble(role, text) {
                var wrap = document.createElement('div');
                wrap.style.display = 'flex';
                wrap.style.justifyContent = role === 'user' ? 'flex-end' : 'flex-start';

                var b = document.createElement('div');
                b.textContent = text;
                b.style.maxWidth = '78%';
                b.style.whiteSpace = 'pre-wrap';
                b.style.fontSize = '13px';
                b.style.lineHeight = '1.35';
                b.style.padding = '10px 10px';
                b.style.borderRadius = '12px';
                b.style.border = '1px solid rgba(0,0,0,0.08)';
                b.style.background = role === 'user' ? '#111' : '#f6f6f6';
                b.style.color = role === 'user' ? '#fff' : '#111';

                wrap.appendChild(b);
                messages.appendChild(wrap);
                messages.scrollTop = messages.scrollHeight;
              }

              function setStatus(t) {
                var el = document.getElementById('assistloop_status');
                if (el) el.textContent = t;
              }

              // WS
              var ws;
              function connect() {
                ws = new WebSocket(wsUrl);

                ws.onopen = function () {
                  setStatus('online');
                  ws.send(JSON.stringify({
                    type: 'hello',
                    agentId: agentId,
                    conversationId: conversationId || undefined,
                    visitorId: visitorId
                  }));
                };

                ws.onclose = function () {
                  setStatus('offline');
                  setTimeout(connect, 1200);
                };

                ws.onerror = function () {
                  setStatus('offline');
                };

                ws.onmessage = function (evt) {
                  var msg = JSON.parse(evt.data);
                  if (msg.type === 'conversation') {
                    conversationId = msg.conversationId;
                    localStorage.setItem(convoKey, conversationId);
                  } else if (msg.type === 'message') {
                    bubble(msg.role, msg.text);
                  } else if (msg.type === 'handoff') {
                    // noop UI for MVP
                  } else if (msg.type === 'error') {
                    console.error('[AssistLoop MVP]', msg.message);
                  }
                };
              }

              function send() {
                var text = input.value.trim();
                if (!text || !ws || ws.readyState !== 1) return;
                input.value = '';
                ws.send(JSON.stringify({
                  type: 'message',
                  conversationId: conversationId,
                  visitorId: visitorId,
                  text: text
                }));
              }

              btn.onclick = function () {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
              };

              sendBtn.onclick = send;
              input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') send();
              });

              connect();
            })();
            `;

            export async function GET() {
              return new NextResponse(WIDGET_JS, {
                headers: {
                  'content-type': 'application/javascript; charset=utf-8',
                  'cache-control': 'no-store'
                }
              });
            }
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # NextAuth client helper (optional)
    # ----------------------------
    write(
        ROOT / "apps/web/src/app/providers.tsx",
        textwrap.dedent(
            """
            'use client';

            import { SessionProvider } from 'next-auth/react';
            import type { ReactNode } from 'react';

            export default function Providers({ children }: { children: ReactNode }) {
              return <SessionProvider>{children}</SessionProvider>;
            }
            """
        ).strip()
        + "\n",
    )

    # Update layout to include providers (simple)
    write(
        ROOT / "apps/web/src/app/layout.tsx",
        textwrap.dedent(
            """
            import './globals.css';
            import type { ReactNode } from 'react';
            import Providers from './providers';

            export const metadata = {
              title: 'AssistLoop MVP',
              description: 'AI customer support widget with human handoff'
            };

            export default function RootLayout({ children }: { children: ReactNode }) {
              return (
                <html lang="en">
                  <body>
                    <Providers>{children}</Providers>
                  </body>
                </html>
              );
            }
            """
        ).strip()
        + "\n",
    )

    # ----------------------------
    # Done
    # ----------------------------
    print(f"✅ Generated: {ROOT.resolve()}")
    print("\nNext steps:")
    print("1) cd assistloop-mvp")
    print("2) corepack enable && pnpm install")
    print("3) create apps/web/.env (see README)")
    print("4) pnpm -C apps/web prisma migrate dev --name init")
    print("5) pnpm -C apps/web prisma db seed")
    print("6) pnpm dev")


if __name__ == "__main__":
    main()
