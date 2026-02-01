export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
}

export interface StreamEvent {
  content?: string;
  done?: boolean;
  error?: string;
  titleUpdate?: string;
  status?: "analyzing" | "planning" | "researching" | "generating" | "complete";
  step?: string;
  tasks?: AgentTask[];
  currentTaskId?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface AgentTask {
  id: string;
  name: string;
  status: "pending" | "running" | "complete";
  description?: string;
}

export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  content: string;
  lineCount: number;
}
