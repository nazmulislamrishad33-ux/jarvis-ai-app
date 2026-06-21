import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCKOUT_KEY = "jarvis_lockout";
const WRONG_PIN_KEY = "jarvis_wrong_pin_count";

const OTP_REGEX = /\b\d{4,8}\b/g;
const CREDIT_CARD_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const PASSWORD_REGEX =
  /(?:password|passwd|pwd|পাসওয়ার্ড)\s*[:=]?\s*\S+/gi;
const CVV_REGEX = /\b(cvv|cvc)\s*[:=]?\s*\d{3,4}\b/gi;

const DANGEROUS_COMMANDS = [
  "delete files",
  "ফাইল মুছে",
  "wipe gallery",
  "গ্যালারি মুছে",
  "format phone",
  "ফোন ফরম্যাট",
  "সব ডিলিট",
  "delete all",
  "factory reset",
  "ফ্যাক্টরি রিসেট",
];

export function maskSensitiveData(input: string): string {
  let masked = input;
  masked = masked.replace(CREDIT_CARD_REGEX, "[CREDIT_CARD_MASKED]");
  masked = masked.replace(CVV_REGEX, "[CVV_MASKED]");
  masked = masked.replace(PASSWORD_REGEX, "[PASSWORD_MASKED]");
  return masked;
}

export function isDangerousCommand(input: string): boolean {
  const lower = input.toLowerCase();
  return DANGEROUS_COMMANDS.some((cmd) => lower.includes(cmd.toLowerCase()));
}

export async function isLockedOut(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LOCKOUT_KEY);
  if (!raw) return false;
  const lockUntil = parseInt(raw, 10);
  if (Date.now() < lockUntil) return true;
  await AsyncStorage.removeItem(LOCKOUT_KEY);
  await AsyncStorage.removeItem(WRONG_PIN_KEY);
  return false;
}

export async function getLockoutRemainingMinutes(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOCKOUT_KEY);
  if (!raw) return 0;
  const lockUntil = parseInt(raw, 10);
  const remaining = lockUntil - Date.now();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 60000);
}

export async function recordWrongPin(): Promise<{
  locked: boolean;
  attemptsLeft: number;
}> {
  const raw = await AsyncStorage.getItem(WRONG_PIN_KEY);
  const count = raw ? parseInt(raw, 10) + 1 : 1;
  await AsyncStorage.setItem(WRONG_PIN_KEY, String(count));

  if (count >= 6) {
    const lockUntil = Date.now() + 30 * 60 * 1000;
    await AsyncStorage.setItem(LOCKOUT_KEY, String(lockUntil));
    await AsyncStorage.removeItem(WRONG_PIN_KEY);
    return { locked: true, attemptsLeft: 0 };
  }

  return { locked: false, attemptsLeft: 6 - count };
}

export async function clearWrongPinCount(): Promise<void> {
  await AsyncStorage.removeItem(WRONG_PIN_KEY);
}

export async function encryptCredentials(data: {
  name: string;
  pin: string;
}): Promise<string> {
  const salt = "JARVIS_SALT_2025_SECURE";
  const combined = `${data.name}||${data.pin}`;
  const encoded = btoa(unescape(encodeURIComponent(combined + salt)));
  return encoded;
}

export async function decryptCredentials(encoded: string): Promise<{
  name: string;
  pin: string;
} | null> {
  try {
    const salt = "JARVIS_SALT_2025_SECURE";
    const combined = decodeURIComponent(escape(atob(encoded)));
    const withoutSalt = combined.slice(0, combined.length - salt.length);
    const [name, pin] = withoutSalt.split("||");
    if (!name || !pin) return null;
    return { name, pin };
  } catch {
    return null;
  }
}
