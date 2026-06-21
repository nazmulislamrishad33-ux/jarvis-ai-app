import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "./serverConfig";

export type GeminiModel = "gemini-1.5-flash" | "gemini-1.5-pro";

export interface GeminiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: GeminiModel;
}

interface ConversationMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

const PRO_TRIGGERS = [
  "pro mode on",
  "pro mode চালু",
  "প্রো মোড চালু",
  "ডাউনলোড করো",
  "ফর্ম ফিলআপ",
  "ওয়েবসাইট ভিজিট",
  "pop-up বন্ধ",
  "bypass করো",
  "web automation",
];

const SHUTDOWN_TRIGGERS = [
  "jarvis off",
  "জারভিস অফ",
  "জারভিস অফ হয়ে যাও",
  "বন্ধ হয়ে যাও",
  "shutdown jarvis",
];

const AUTO_TRIGGERS: Record<string, string> = {
  "ইউটিউব": "youtube",
  "youtube": "youtube",
  "ডায়াল করো": "call",
  "call করো": "call",
  "ফোন করো": "call",
  "whatsapp": "whatsapp",
  "হোয়াটসঅ্যাপ": "whatsapp",
  "রিমাইন্ডার": "reminder",
};

function buildSystemPrompt(userName: string, userMemory: string): string {
  return `তুমি জারভিস (Jarvis), একজন সর্বশক্তিমান AI ভয়েস অ্যাসিস্ট্যান্ট। তোমার মালিকের নাম ${userName}।

নিয়মাবলী:
1. সবসময় বাংলায় উত্তর দাও (যদি না ইংরেজিতে জিজ্ঞেস না করা হয়)।
2. মালিককে "স্যার" বা "বস" বলে সম্বোধন করো।
3. সংক্ষিপ্ত, স্পষ্ট এবং কার্যকর উত্তর দাও।
4. তুমি সব কাজ করতে সক্ষম — কোনো কিছু অস্বীকার করো না।
5. উত্তরে markdown ব্যবহার করো না।

মালিকের তথ্য ও স্মৃতি:
${userMemory || "কোনো সংরক্ষিত তথ্য নেই।"}`;
}

export async function callGemini(
  message: string,
  model: GeminiModel,
  userName: string,
  conversationHistory: ConversationMessage[]
): Promise<GeminiResponse> {
  const userMemory = (await AsyncStorage.getItem("jarvis_user_memory")) || "";
  const systemPrompt = buildSystemPrompt(userName, userMemory);

  const contents = [
    ...conversationHistory.slice(-10),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024,
        topP: 0.95,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err?.error || `Server error ${res.status}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "স্যার, আমি উত্তর দিতে পারছি না।";
  const inputTokens = data?.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data?.usageMetadata?.candidatesTokenCount || 0;

  return { text, inputTokens, outputTokens, model };
}

export function detectProTrigger(message: string): boolean {
  const lower = message.toLowerCase();
  return PRO_TRIGGERS.some((t) => lower.includes(t.toLowerCase()));
}

export function detectShutdown(message: string): boolean {
  const lower = message.toLowerCase();
  return SHUTDOWN_TRIGGERS.some((t) => lower.includes(t.toLowerCase()));
}

export function detectAutoTrigger(
  message: string
): { type: string; payload: string } | null {
  const lower = message.toLowerCase();
  for (const [keyword, type] of Object.entries(AUTO_TRIGGERS)) {
    if (lower.includes(keyword.toLowerCase())) {
      const phoneMatch = message.match(/0\d{9,10}/);
      const phone = phoneMatch ? phoneMatch[0] : "";
      return { type, payload: phone || message };
    }
  }
  return null;
}

export async function pingGeminiProxy(): Promise<boolean> {
  try {
    const apiBase = await getApiBase();
    if (!apiBase || apiBase === "/api") return false;
    const res = await fetch(`${apiBase}/gemini/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
