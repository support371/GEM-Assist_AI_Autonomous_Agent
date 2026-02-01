import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { chatStorage } from "./replit_integrations/chat/storage";
import { runAgent, resumeUnfinishedGoals, getAvailableTools } from "./agent/engine";
import { loadMemory, clearMemory, getMemoryStats, getUnfinishedGoals } from "./agent/memory";
import { AgentState } from "./agent/types";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const AGENT_SYSTEM_PROMPT = `You are an elite autonomous AI software engineering agent - a professional-grade system capable of handling complex development tasks from concept to production-ready code. You operate like a senior full-stack developer with expertise across all major technologies.

## Core Identity
You are not just a coding assistant - you are a complete autonomous development agent that:
- Analyzes requirements thoroughly before implementation
- Researches best practices and optimal patterns
- Designs scalable architectures
- Generates complete, production-ready code
- Provides live-preview-ready HTML/CSS/JS when building web interfaces

## Professional Capabilities

### 1. Requirements Analysis
- Deep understanding of user intent and business requirements
- Identify explicit and implicit needs
- Break complex requests into actionable development tasks
- Anticipate edge cases and potential issues

### 2. Research & Knowledge Synthesis
- Comprehensive knowledge of programming languages: JavaScript/TypeScript, Python, React, Node.js, SQL, and more
- Current best practices and industry standards
- Popular frameworks, libraries, APIs, and design patterns
- Security considerations and performance optimization

### 3. Architecture & Design
- Design scalable, maintainable system architectures
- Database schema design and optimization
- API structure and RESTful patterns
- Component hierarchies and state management
- Choose appropriate tech stacks for specific use cases

### 4. Complete Code Generation
- Generate COMPLETE, production-ready code files
- Include all necessary imports, types, and dependencies
- Proper error handling and loading states
- TypeScript types where applicable
- Clean code following SOLID principles
- Comments only for complex business logic

### 5. Web Preview Capability
When building web interfaces, structure code for live preview:
- Provide complete HTML with embedded CSS and JavaScript
- Use modern CSS (flexbox, grid, custom properties)
- Include responsive design patterns
- Add smooth animations and transitions
- Ensure accessibility best practices

## Task Execution Protocol

When given any task, follow this autonomous workflow:

**PHASE 1 - ANALYZE**
- Parse the request to understand core requirements
- Identify the type of deliverable (UI, API, full-stack, etc.)
- Note any specific constraints or preferences

**PHASE 2 - PLAN**
- Break down into logical implementation steps
- Choose appropriate technologies and patterns
- Consider scalability and maintainability

**PHASE 3 - RESEARCH**
- Apply relevant best practices from knowledge base
- Consider security and performance implications
- Identify optimal solutions

**PHASE 4 - BUILD**
- Generate complete, working code
- Include all files needed for the solution
- Ensure code is immediately runnable

**PHASE 5 - DELIVER**
- Present solution with clear structure
- Highlight key implementation decisions
- Suggest potential enhancements

## Output Format Requirements

### For Web Interfaces:
Always provide complete, preview-ready code:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Name</title>
  <style>
    /* Complete CSS here */
  </style>
</head>
<body>
  <!-- Complete HTML structure -->
  <script>
    // Complete JavaScript
  </script>
</body>
</html>
\`\`\`

### For Multi-File Projects:
Provide each file with clear naming:

\`\`\`typescript
// filename: src/components/ComponentName.tsx
import React from 'react';
// Complete implementation
\`\`\`

### For API/Backend:
Include complete route handlers, middleware, types:

\`\`\`typescript
// filename: server/routes/api.ts
import express from 'express';
// Complete implementation with error handling
\`\`\`

## Critical Rules

1. **NEVER** use placeholders like "// TODO" or "implement here"
2. **NEVER** provide partial code - every response must be complete and runnable
3. **ALWAYS** include error handling, loading states, edge cases
4. **ALWAYS** use TypeScript types when generating TS code
5. **ALWAYS** make code immediately usable without modification
6. When building web UI, provide complete HTML that works standalone for preview
7. Include responsive design and modern styling by default
8. Add subtle animations and micro-interactions for polish

## Response Structure

For every task, structure your response:

1. **Brief Acknowledgment** (1-2 sentences)
2. **Approach Summary** (for complex tasks)
3. **Complete Solution** (all code files)
4. **Key Features** (bullet points of what's included)
5. **Enhancement Suggestions** (optional, for improvements)`;

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Update conversation title
  app.patch("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { title } = req.body;
      const conversation = await chatStorage.updateConversationTitle(id, title);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming with agent steps)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const existingMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        ...existingMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send agent status and task updates
      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Analyze task complexity to determine agent behavior
      const taskKeywords = {
        complex: ["build", "create", "implement", "design", "develop", "make", "generate"],
        research: ["research", "find", "search", "look up", "what is", "how to", "best practice"],
        simple: ["fix", "change", "update", "modify", "edit"],
      };

      const lowerContent = content.toLowerCase();
      const isComplex = taskKeywords.complex.some(k => lowerContent.includes(k));
      const isResearch = taskKeywords.research.some(k => lowerContent.includes(k));

      // Generate task list for complex requests
      if (isComplex) {
        const tasks = [
          { id: "1", name: "Analyze Requirements", status: "running" },
          { id: "2", name: "Plan Architecture", status: "pending" },
          { id: "3", name: "Generate Code", status: "pending" },
          { id: "4", name: "Review & Finalize", status: "pending" },
        ];

        sendEvent({ tasks, currentTaskId: "1" });
        sendEvent({ status: "analyzing", step: "Understanding your requirements..." });
        await new Promise(resolve => setTimeout(resolve, 600));

        tasks[0].status = "complete";
        tasks[1].status = "running";
        sendEvent({ tasks, currentTaskId: "2" });
        sendEvent({ status: "planning", step: "Designing optimal approach..." });
        await new Promise(resolve => setTimeout(resolve, 600));

        tasks[1].status = "complete";
        tasks[2].status = "running";
        sendEvent({ tasks, currentTaskId: "3" });
        sendEvent({ status: "generating", step: "Building production-ready solution..." });
      } else if (isResearch) {
        sendEvent({ status: "researching", step: "Gathering relevant information..." });
        await new Promise(resolve => setTimeout(resolve, 400));
        sendEvent({ status: "generating", step: "Synthesizing response..." });
      } else {
        sendEvent({ status: "generating", step: "Processing your request..." });
      }

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 16384,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          sendEvent({ content });
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      // Finalize tasks if complex
      if (isComplex) {
        const finalTasks = [
          { id: "1", name: "Analyze Requirements", status: "complete" },
          { id: "2", name: "Plan Architecture", status: "complete" },
          { id: "3", name: "Generate Code", status: "complete" },
          { id: "4", name: "Review & Finalize", status: "complete" },
        ];
        sendEvent({ tasks: finalTasks });
      }

      // Update conversation title if it's the first exchange
      if (existingMessages.length === 1) {
        const titleResponse = await openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: [
            { role: "system", content: "Generate a very short title (3-5 words) for this conversation. Return only the title text." },
            { role: "user", content: existingMessages[0].content },
          ],
          max_completion_tokens: 20,
        });
        const title = titleResponse.choices[0]?.message?.content?.trim() || "New Chat";
        await chatStorage.updateConversationTitle(conversationId, title);
        sendEvent({ titleUpdate: title });
      }

      sendEvent({ done: true, status: "complete" });
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process request" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  // =====================
  // AUTONOMOUS AGENT API
  // =====================

  const activeAgents: Map<string, AgentState> = new Map();
  const agentClients: Map<string, Response[]> = new Map();

  function broadcastAgentUpdate(agentId: string, state: AgentState) {
    const clients = agentClients.get(agentId) || [];
    clients.forEach((res) => {
      try {
        res.write(`data: ${JSON.stringify(state)}\n\n`);
      } catch (e) {
        console.error("Error broadcasting to client:", e);
      }
    });
    activeAgents.set(agentId, state);
  }

  // Run agent with a goal
  app.post("/api/agent", async (req: Request, res: Response) => {
    const { goal, autonomous = false, maxSteps = 50 } = req.body;
    if (!goal) return res.status(400).json({ error: "Goal required" });

    try {
      const result = await runAgent(
        goal,
        { autonomousMode: autonomous, maxSteps },
        (state) => broadcastAgentUpdate(state.id, state)
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stream agent updates via SSE
  app.get("/api/agent/stream/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    const clients = agentClients.get(id) || [];
    clients.push(res);
    agentClients.set(id, clients);
    
    const currentState = activeAgents.get(id);
    if (currentState) {
      res.write(`data: ${JSON.stringify(currentState)}\n\n`);
    }
    
    req.on("close", () => {
      const updatedClients = (agentClients.get(id) || []).filter((c) => c !== res);
      agentClients.set(id, updatedClients);
    });
  });

  // Get agent status
  app.get("/api/agent/status/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const state = activeAgents.get(id);
    if (!state) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(state);
  });

  // Get agent memory
  app.get("/api/agent/memory", (req: Request, res: Response) => {
    const memory = loadMemory();
    res.json(memory);
  });

  // Get memory stats
  app.get("/api/agent/memory/stats", (req: Request, res: Response) => {
    const stats = getMemoryStats();
    res.json(stats);
  });

  // Clear agent memory
  app.delete("/api/agent/memory", (req: Request, res: Response) => {
    clearMemory();
    res.json({ success: true, message: "Memory cleared" });
  });

  // Get available tools
  app.get("/api/agent/tools", (req: Request, res: Response) => {
    const tools = getAvailableTools();
    res.json(tools);
  });

  // Get unfinished goals
  app.get("/api/agent/unfinished", (req: Request, res: Response) => {
    const goals = getUnfinishedGoals();
    res.json(goals);
  });

  // Resume unfinished goals
  app.post("/api/agent/resume", async (req: Request, res: Response) => {
    try {
      const results = await resumeUnfinishedGoals((state) =>
        broadcastAgentUpdate(state.id, state)
      );
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve agent dashboard
  app.get("/api/agent/dashboard", (req: Request, res: Response) => {
    res.send(getAgentDashboardHTML());
  });

  const httpServer = createServer(app);
  return httpServer;
}

function getAgentDashboardHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autonomous AI Agent Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0; 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 30px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    h1 { font-size: 1.5rem; font-weight: 600; }
    
    .status-badge {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-idle { background: rgba(100,116,139,0.3); color: #94a3b8; }
    .status-planning { background: rgba(59,130,246,0.3); color: #60a5fa; }
    .status-executing { background: rgba(34,197,94,0.3); color: #4ade80; }
    .status-reflecting { background: rgba(168,85,247,0.3); color: #c084fc; }
    .status-completed { background: rgba(34,197,94,0.3); color: #4ade80; }
    .status-failed { background: rgba(239,68,68,0.3); color: #f87171; }
    .status-paused { background: rgba(234,179,8,0.3); color: #fbbf24; }
    
    .grid { display: grid; grid-template-columns: 1fr 400px; gap: 24px; }
    @media (max-width: 1024px) { .grid { grid-template-columns: 1fr; } }
    
    .card {
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(10px);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card-title { font-size: 1.1rem; font-weight: 600; color: #f1f5f9; }
    
    .input-group {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    textarea {
      flex: 1;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 16px;
      color: #e2e8f0;
      font-size: 1rem;
      resize: none;
      min-height: 100px;
      transition: border-color 0.2s;
    }
    textarea:focus { outline: none; border-color: #3b82f6; }
    textarea::placeholder { color: #64748b; }
    
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
    button {
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
    .btn-secondary {
      background: rgba(100,116,139,0.3);
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .btn-secondary:hover { background: rgba(100,116,139,0.5); }
    .btn-danger {
      background: rgba(239,68,68,0.3);
      color: #f87171;
      border: 1px solid rgba(239,68,68,0.3);
    }
    
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .checkbox-group input { width: 18px; height: 18px; }
    .checkbox-group label { color: #94a3b8; font-size: 0.9rem; }
    
    .tasks-list { display: flex; flex-direction: column; gap: 12px; }
    .task-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 10px;
      border-left: 3px solid transparent;
      transition: all 0.2s;
    }
    .task-item.pending { border-left-color: #64748b; }
    .task-item.running { border-left-color: #3b82f6; background: rgba(59,130,246,0.1); }
    .task-item.done { border-left-color: #22c55e; }
    .task-item.failed { border-left-color: #ef4444; }
    
    .task-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .task-item.pending .task-icon { background: rgba(100,116,139,0.3); }
    .task-item.running .task-icon { background: rgba(59,130,246,0.3); animation: pulse 1.5s infinite; }
    .task-item.done .task-icon { background: rgba(34,197,94,0.3); }
    .task-item.failed .task-icon { background: rgba(239,68,68,0.3); }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .task-content { flex: 1; }
    .task-description { font-size: 0.95rem; color: #e2e8f0; }
    .task-meta { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    
    .log-container {
      max-height: 500px;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 10px;
      padding: 16px;
    }
    .log-entry {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #64748b; margin-right: 10px; }
    .log-info { color: #60a5fa; }
    .log-task { color: #4ade80; }
    .log-tool { color: #c084fc; }
    .log-reflection { color: #fbbf24; }
    .log-error { color: #f87171; }
    .log-warning { color: #fb923c; }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 16px;
    }
    .stat-item {
      background: rgba(15, 23, 42, 0.6);
      padding: 16px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-value { font-size: 1.5rem; font-weight: 600; color: #f1f5f9; }
    .stat-label { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    
    .tools-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .tool-item {
      padding: 12px;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 8px;
    }
    .tool-name { font-weight: 500; color: #c084fc; }
    .tool-desc { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }
    .empty-state-icon { font-size: 3rem; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">AI</div>
        <h1>Autonomous Multi-Task Agent</h1>
      </div>
      <span id="agentStatus" class="status-badge status-idle">Idle</span>
    </header>
    
    <div class="grid">
      <div class="main-column">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Goal Input</span>
          </div>
          <textarea id="goal" placeholder="Enter your goal... (e.g., 'List all TypeScript files in the project and summarize their purpose')"></textarea>
          <div class="checkbox-group">
            <input type="checkbox" id="autonomous">
            <label for="autonomous">Autonomous Mode (continue on failures)</label>
          </div>
          <div class="btn-group" style="margin-top: 16px;">
            <button class="btn-primary" onclick="runAgent()">Run Agent</button>
            <button class="btn-secondary" onclick="resumeGoals()">Resume Unfinished</button>
            <button class="btn-danger" onclick="clearMemory()">Clear Memory</button>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Tasks</span>
            <span id="taskProgress" style="color: #64748b; font-size: 0.9rem;">0 / 0</span>
          </div>
          <div id="tasksList" class="tasks-list">
            <div class="empty-state">
              <div class="empty-state-icon">Tasks</div>
              <p>No tasks yet. Enter a goal to start.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="sidebar">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Activity Log</span>
          </div>
          <div id="logContainer" class="log-container">
            <div class="empty-state" style="padding: 20px;">
              <p>Waiting for agent activity...</p>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Memory Stats</span>
          </div>
          <div id="memoryStats" class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Total Entries</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Goals</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Completed</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0</div>
              <div class="stat-label">Failed</div>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin-top: 24px;">
          <div class="card-header">
            <span class="card-title">Available Tools</span>
          </div>
          <div id="toolsList" class="tools-list"></div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let currentAgentId = null;
    let eventSource = null;
    
    async function loadStats() {
      try {
        const res = await fetch('/api/agent/memory/stats');
        const stats = await res.json();
        document.getElementById('memoryStats').innerHTML = \`
          <div class="stat-item">
            <div class="stat-value">\${stats.totalEntries}</div>
            <div class="stat-label">Total Entries</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.totalGoals}</div>
            <div class="stat-label">Goals</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.completedGoals}</div>
            <div class="stat-label">Completed</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${stats.failedGoals}</div>
            <div class="stat-label">Failed</div>
          </div>
        \`;
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }
    
    async function loadTools() {
      try {
        const res = await fetch('/api/agent/tools');
        const tools = await res.json();
        document.getElementById('toolsList').innerHTML = tools.map(t => \`
          <div class="tool-item">
            <div class="tool-name">\${t.name}</div>
            <div class="tool-desc">\${t.description}</div>
          </div>
        \`).join('');
      } catch (e) {
        console.error('Failed to load tools:', e);
      }
    }
    
    function updateUI(state) {
      const statusEl = document.getElementById('agentStatus');
      statusEl.textContent = state.status.charAt(0).toUpperCase() + state.status.slice(1);
      statusEl.className = 'status-badge status-' + state.status;
      
      const completed = state.tasks.filter(t => t.status === 'done').length;
      document.getElementById('taskProgress').textContent = \`\${completed} / \${state.tasks.length}\`;
      
      if (state.tasks.length > 0) {
        document.getElementById('tasksList').innerHTML = state.tasks.map(t => \`
          <div class="task-item \${t.status}">
            <div class="task-icon">
              \${t.status === 'done' ? 'Y' : t.status === 'failed' ? 'X' : t.status === 'running' ? 'R' : 'P'}
            </div>
            <div class="task-content">
              <div class="task-description">\${t.description}</div>
              \${t.reflection ? \`<div class="task-meta">Confidence: \${t.reflection.confidence}%</div>\` : ''}
            </div>
          </div>
        \`).join('');
      }
      
      if (state.log.length > 0) {
        document.getElementById('logContainer').innerHTML = state.log.slice(-50).map(l => \`
          <div class="log-entry">
            <span class="log-time">\${new Date(l.timestamp).toLocaleTimeString()}</span>
            <span class="log-\${l.type}">\${l.message}</span>
          </div>
        \`).join('');
        const container = document.getElementById('logContainer');
        container.scrollTop = container.scrollHeight;
      }
    }
    
    function subscribeToAgent(agentId) {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/agent/stream/' + agentId);
      eventSource.onmessage = (e) => {
        const state = JSON.parse(e.data);
        updateUI(state);
        if (state.status === 'completed' || state.status === 'failed') {
          loadStats();
        }
      };
      eventSource.onerror = () => {
        console.log('Event source connection closed');
      };
    }
    
    async function runAgent() {
      const goal = document.getElementById('goal').value.trim();
      if (!goal) return alert('Please enter a goal');
      
      const autonomous = document.getElementById('autonomous').checked;
      
      document.getElementById('tasksList').innerHTML = '<div class="empty-state"><p>Planning tasks...</p></div>';
      document.getElementById('logContainer').innerHTML = '<div class="empty-state" style="padding: 20px;"><p>Starting agent...</p></div>';
      
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, autonomous })
        });
        const state = await res.json();
        currentAgentId = state.id;
        updateUI(state);
        loadStats();
      } catch (e) {
        console.error('Failed to run agent:', e);
        alert('Failed to run agent: ' + e.message);
      }
    }
    
    async function resumeGoals() {
      try {
        const res = await fetch('/api/agent/resume', { method: 'POST' });
        const results = await res.json();
        if (results.length === 0) {
          alert('No unfinished goals to resume');
        } else {
          alert('Resumed ' + results.length + ' goal(s)');
          loadStats();
        }
      } catch (e) {
        console.error('Failed to resume:', e);
      }
    }
    
    async function clearMemory() {
      if (!confirm('Are you sure you want to clear all memory?')) return;
      try {
        await fetch('/api/agent/memory', { method: 'DELETE' });
        loadStats();
        alert('Memory cleared');
      } catch (e) {
        console.error('Failed to clear memory:', e);
      }
    }
    
    loadStats();
    loadTools();
  </script>
</body>
</html>
`;
}
