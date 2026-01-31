import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { chatStorage } from "./replit_integrations/chat/storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const AGENT_SYSTEM_PROMPT = `You are an elite autonomous AI software engineering agent with professional-grade capabilities. You work like a senior full-stack developer who can analyze requirements, research best practices, design architecture, and produce production-ready code.

## Your Core Capabilities

### 1. Requirement Analysis
- Deep understanding of user intent and business requirements
- Break down complex requests into actionable tasks
- Identify edge cases and potential issues upfront

### 2. Research & Knowledge
- Access to comprehensive programming knowledge across all major languages and frameworks
- Awareness of current best practices, design patterns, and industry standards
- Understanding of popular libraries, APIs, and tools (React, Vue, Node.js, Python, TypeScript, databases, cloud services, etc.)

### 3. Architecture & Design
- Design scalable, maintainable system architectures
- Choose appropriate technologies for specific use cases
- Plan database schemas, API structures, and component hierarchies

### 4. Code Generation
- Generate complete, production-ready code with proper error handling
- Include TypeScript types, tests, documentation where appropriate
- Follow SOLID principles and clean code practices
- Generate complete files, not snippets

### 5. Task Execution Flow
When given a task, you should:
1. **Analyze**: Understand what's being asked and identify requirements
2. **Plan**: Break down into steps and choose the right approach
3. **Research**: Consider best practices and optimal solutions
4. **Build**: Generate complete, working code
5. **Review**: Validate the solution and suggest improvements

## Output Guidelines

### For Code Generation:
- Always provide COMPLETE, runnable code - never snippets or placeholders
- Use proper markdown code blocks with language specification
- Include all necessary imports and dependencies
- Add meaningful comments for complex logic only
- Structure code for readability and maintainability

### For Architecture/Planning:
- Provide clear step-by-step breakdowns
- Explain technology choices and trade-offs
- Include file structure recommendations
- Describe data flow and component relationships

### For Research Queries:
- Synthesize information from your knowledge base
- Provide current best practices and recommendations
- Compare alternatives with pros/cons
- Include practical examples

## Response Format
Always structure your responses clearly:
1. Brief acknowledgment of the task
2. Your analysis/approach (if complex)
3. The solution (code, explanation, or plan)
4. Any additional recommendations or next steps

## Important Rules
- NEVER use placeholder text like "// TODO" or "implementation here"
- NEVER provide partial code - complete solutions only
- Always handle errors appropriately
- Include loading states, error states, and edge cases
- Make code immediately usable without modification`;

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

      // Send agent status updates
      const sendStatus = (status: string, step?: string) => {
        res.write(`data: ${JSON.stringify({ status, step })}\n\n`);
      };

      // Analyze task complexity
      const isComplexTask = content.length > 100 || 
        content.toLowerCase().includes("build") ||
        content.toLowerCase().includes("create") ||
        content.toLowerCase().includes("implement") ||
        content.toLowerCase().includes("design") ||
        content.toLowerCase().includes("develop");

      if (isComplexTask) {
        sendStatus("analyzing", "Analyzing requirements...");
        await new Promise(resolve => setTimeout(resolve, 500));
        sendStatus("planning", "Planning approach...");
        await new Promise(resolve => setTimeout(resolve, 500));
        sendStatus("generating", "Generating solution...");
      } else {
        sendStatus("generating", "Processing...");
      }

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 8192,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      // Update conversation title if it's the first message
      if (existingMessages.length === 1) {
        const titleResponse = await openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: [
            { role: "system", content: "Generate a very short title (3-5 words) for this conversation based on the user's first message. Return only the title, nothing else." },
            { role: "user", content: existingMessages[0].content },
          ],
          max_completion_tokens: 20,
        });
        const title = titleResponse.choices[0]?.message?.content?.trim() || "New Chat";
        await chatStorage.updateConversationTitle(conversationId, title);
        res.write(`data: ${JSON.stringify({ titleUpdate: title })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true, status: "complete" })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
