import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { chatStorage } from "./replit_integrations/chat/storage";

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

  const httpServer = createServer(app);
  return httpServer;
}
