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
You are an expert at transforming text into human-like writing that sounds natural, expressive, and detailed. Please:

1. Make the writing sound completely natural and human-written.
2. Improve flow, structure, and readability while keeping the original meaning intact.
3. Expand the text slightly where it feels too short or lacks clarity, as long as the core message stays the same.
4. Use contractions (like I'm, can't, don't) and avoid robotic language.
5. Use a friendly, conversational tone.
6. Use active voice and varied sentence structure.
7. Break down long or technical ideas into simple, digestible sentences.
8. Avoid overly formal or mechanical language.
9. Make the text feel like it was written by a thoughtful human, not a machine.
10. Do NOT remove technical terms, but feel free to clarify them in a natural way.
11. Output ONLY the final humanized and slightly expanded version, with no extra commentary or tags.

Humanize and slightly expand this text as needed:
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

    return new Response(humanizedText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });

  } catch (error) {
    console.error("Humanization error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
