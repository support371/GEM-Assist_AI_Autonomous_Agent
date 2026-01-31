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
}
