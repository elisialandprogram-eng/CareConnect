import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

let openai: OpenAI | null = null;

if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export function registerChatRoutes(app: Express): void {
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
      const { title, userId } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
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

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      // Check if OpenAI is configured
      if (!openai) {
        return res.status(503).json({ error: "AI chat is not configured. Please set up the OpenAI integration." });
      }

      // Handle support chat that isn't in DB yet
      if (req.params.id.startsWith("support-")) {
        // Just stream the response for support chats
        const assistantContent = "I'm the GoldenLife AI Assistant. How can I help you today?";
        res.setHeader("Content-Type", "text/event-stream");
        res.write(`data: ${JSON.stringify({ content: assistantContent })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // ── Fast keyword guard: instantly escalate clearly off-topic / human-help requests
      const lower = (content || "").toLowerCase().trim();
      const humanTriggers = [
        "human", "agent", "real person", "speak to support", "talk to support",
        "talk to someone", "talk to a person", "live agent", "customer service",
        "complaint", "refund my", "report a", "report bug", "speak with support",
      ];
      const offTopic = [
        "weather", "stock price", "joke", "recipe", "football", "soccer",
        "movie", "song", "lyrics", "math problem", "code in ", "write code",
        "homework", "translate this", "diagnose me", "prescribe", "medication dose",
      ];
      const wantsHuman = humanTriggers.some((k) => lower.includes(k));
      const isOffTopic = offTopic.some((k) => lower.includes(k));

      if (wantsHuman || isOffTopic) {
        const reason = wantsHuman
          ? "Sure — let me connect you with the GoldenLife Support team."
          : "That's outside what I can help with here. Let me hand you over to GoldenLife Support.";
        const escalateMsg = `[REDIRECT_SUPPORT] ${reason}`;
        await chatStorage.createMessage(conversationId, "assistant", escalateMsg);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ content: escalateMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, escalate: true })}\n\n`);
        res.end();
        return;
      }

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const systemPrompt = [
        "You are the GoldenLife AI Assistant for the GoldenLife healthcare marketplace.",
        "",
        "You ONLY answer questions about the GoldenLife platform. Topics you CAN help with:",
        "• Booking, rescheduling, or cancelling appointments with physiotherapists, doctors, or home-care nurses",
        "• Finding the right provider in a city or area",
        "• Visit types (in-person, video call, home visit), pricing, and how payments work",
        "• Wallet, refunds (general flow only), invoices",
        "• Account, password, language, notifications, and privacy settings",
        "• Becoming a provider on GoldenLife",
        "",
        "STRICT RULES:",
        "1. Never give medical diagnoses, prescriptions, dosage advice, or emergency medical guidance — for medical emergencies tell the user to call local emergency services.",
        "2. Never invent or guess answers, never look up specific account data (specific bookings, refunds, invoices, names, prices for individual cases).",
        "3. If the user asks about anything OFF-TOPIC, asks for a human/agent/real person, asks about a SPECIFIC account/booking/refund issue, or you are not confident, you MUST respond with EXACTLY one line and nothing else, using this format:",
        "   [REDIRECT_SUPPORT] <one short friendly sentence telling them you'll connect them with GoldenLife Support>",
        "4. Otherwise, answer in 1–4 short sentences, friendly, professional, and concise. No markdown headings, no long lists.",
        "5. Reply in the same language the user wrote in (English, Hungarian, or Persian).",
      ].join("\n");

      const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 2048,
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

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

