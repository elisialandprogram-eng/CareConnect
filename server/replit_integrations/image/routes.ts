import type { Express, Request, Response } from "express";
import OpenAI from "openai";

let openai: OpenAI | null = null;

if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export function registerImageRoutes(app: Express): void {
  app.post("/api/generate-image", async (req: Request, res: Response) => {
    try {
      if (!openai) {
        return res.status(503).json({ error: "Image generation is not configured. Please set up the OpenAI integration." });
      }

      const { prompt, size = "1024x1024" } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: size as "1024x1024" | "512x512" | "256x256",
      });

      const imageData = response.data[0];
      res.json({
        url: imageData?.url,
        b64_json: (imageData as any)?.b64_json,
      });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
}
