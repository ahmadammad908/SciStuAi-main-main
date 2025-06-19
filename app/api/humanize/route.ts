import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Invalid text input" },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are an expert at transforming text into natural, human-like writing. Please:

1. Make the text sound completely natural like a human wrote it
2. Keep the meaning identical but improve flow and readability
3. Use contractions (I'm, don't, etc.)
4. Break long sentences into shorter ones
5. Vary sentence structure
6. Use active voice
7. Maintain a friendly, conversational tone
8. Remove any robotic phrasing
9. Keep technical terms when necessary but explain simply
10. Output ONLY the humanized text with no additional commentary or prefix

Humanize this text exactly as written, don't add any new information:
`;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}${text}` }]
        }
      ]
    });

    const response = await result.response;
    const humanizedText = response.text();

    // Return as plain text
    return new Response(humanizedText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}