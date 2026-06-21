import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GeminiModel } from "./geminiService";

const BILL_KEY = "jarvis_bill_data";

interface BillData {
  month: string;
  totalCost: number;
  flashInputTokens: number;
  flashOutputTokens: number;
  proInputTokens: number;
  proOutputTokens: number;
  callCount: number;
}

const PRICING = {
  "gemini-1.5-flash": {
    input: 0.075 / 1_000_000,
    output: 0.30 / 1_000_000,
  },
  "gemini-1.5-pro": {
    input: 1.25 / 1_000_000,
    output: 5.00 / 1_000_000,
  },
};

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function loadBillData(): Promise<BillData> {
  const currentMonth = getCurrentMonth();
  try {
    const raw = await AsyncStorage.getItem(BILL_KEY);
    if (raw) {
      const data: BillData = JSON.parse(raw);
      if (data.month === currentMonth) return data;
    }
  } catch {}
  return {
    month: currentMonth,
    totalCost: 0,
    flashInputTokens: 0,
    flashOutputTokens: 0,
    proInputTokens: 0,
    proOutputTokens: 0,
    callCount: 0,
  };
}

export async function recordUsage(
  model: GeminiModel,
  inputTokens: number,
  outputTokens: number
): Promise<BillData> {
  const data = await loadBillData();
  const pricing = PRICING[model];
  const cost = inputTokens * pricing.input + outputTokens * pricing.output;

  data.totalCost += cost;
  data.callCount += 1;

  if (model === "gemini-1.5-flash") {
    data.flashInputTokens += inputTokens;
    data.flashOutputTokens += outputTokens;
  } else {
    data.proInputTokens += inputTokens;
    data.proOutputTokens += outputTokens;
  }

  await AsyncStorage.setItem(BILL_KEY, JSON.stringify(data));
  return data;
}

export function formatBill(cost: number): string {
  if (cost < 0.001) return "$0.0000";
  return `$${cost.toFixed(4)}`;
}

export async function resetBill(): Promise<void> {
  const currentMonth = getCurrentMonth();
  const fresh: BillData = {
    month: currentMonth,
    totalCost: 0,
    flashInputTokens: 0,
    flashOutputTokens: 0,
    proInputTokens: 0,
    proOutputTokens: 0,
    callCount: 0,
  };
  await AsyncStorage.setItem(BILL_KEY, JSON.stringify(fresh));
}
