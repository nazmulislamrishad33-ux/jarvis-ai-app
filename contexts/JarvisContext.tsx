import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";
import { formatBill, loadBillData, recordUsage } from "../services/billTracker";
import {
  decryptCredentials,
  encryptCredentials,
  isLockedOut,
} from "../services/securityFilters";

export type GeminiModel = "gemini-1.5-flash" | "gemini-1.5-pro";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface JarvisContextType {
  isActivated: boolean;
  isShutdown: boolean;
  isWakeLockEnabled: boolean;
  isPocketModeEnabled: boolean;
  isOffline: boolean;
  isLocked: boolean;
  currentModel: GeminiModel;
  billDisplay: string;
  userName: string;
  pin: string;
  messages: Message[];
  activate: (name: string, pin: string) => Promise<void>;
  deactivate: () => Promise<void>;
  addMessage: (msg: Message) => void;
  updateBill: (
    model: GeminiModel,
    inputTokens: number,
    outputTokens: number
  ) => Promise<void>;
  switchToProMode: () => void;
  switchToFlashMode: () => void;
  setWakeLockEnabled: (val: boolean) => void;
  setPocketModeEnabled: (val: boolean) => void;
  setOffline: (val: boolean) => void;
  triggerShutdown: () => void;
  setIsLocked: (val: boolean) => void;
  saveUserMemory: (memory: string) => Promise<void>;
}

const JarvisContext = createContext<JarvisContextType | null>(null);

const SECURE_KEY = "jarvis_credentials_v2";
const MESSAGES_KEY = "jarvis_messages";

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [isActivated, setIsActivated] = useState(false);
  const [isShutdown, setIsShutdown] = useState(false);
  const [isWakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [isPocketModeEnabled, setPocketModeEnabled] = useState(false);
  const [isOffline, setOffline] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [currentModel, setCurrentModel] = useState<GeminiModel>(
    "gemini-1.5-flash"
  );
  const [billDisplay, setBillDisplay] = useState("$0.0000");
  const [userName, setUserName] = useState("");
  const [pin, setPin] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const locked = await isLockedOut();
        if (locked) {
          setIsLocked(true);
          return;
        }

        const encoded = await secureGet(SECURE_KEY);
        if (encoded) {
          const creds = await decryptCredentials(encoded);
          if (creds) {
            setUserName(creds.name);
            setPin(creds.pin);
            setIsActivated(true);
          }
        }

        const savedMsgs = await AsyncStorage.getItem(MESSAGES_KEY);
        if (savedMsgs) {
          setMessages(JSON.parse(savedMsgs));
        }

        const billData = await loadBillData();
        setBillDisplay(formatBill(billData.totalCost));
      } catch {}
    })();
  }, []);

  const activate = useCallback(async (name: string, newPin: string) => {
    const encoded = await encryptCredentials({ name, pin: newPin });
    await secureSet(SECURE_KEY, encoded);
    setUserName(name);
    setPin(newPin);
    setIsActivated(true);
  }, []);

  const deactivate = useCallback(async () => {
    await secureDelete(SECURE_KEY);
    await AsyncStorage.removeItem(MESSAGES_KEY);
    setIsActivated(false);
    setUserName("");
    setPin("");
    setMessages([]);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(next.slice(-100)));
      return next;
    });
  }, []);

  const updateBill = useCallback(
    async (model: GeminiModel, inputTokens: number, outputTokens: number) => {
      const data = await recordUsage(model, inputTokens, outputTokens);
      setBillDisplay(formatBill(data.totalCost));
    },
    []
  );

  const switchToProMode = useCallback(() => {
    setCurrentModel("gemini-1.5-pro");
    setTimeout(() => {
      setCurrentModel("gemini-1.5-flash");
    }, 30000);
  }, []);

  const switchToFlashMode = useCallback(() => {
    setCurrentModel("gemini-1.5-flash");
  }, []);

  const triggerShutdown = useCallback(() => {
    setIsShutdown(true);
    setWakeLockEnabled(false);
    setPocketModeEnabled(false);
  }, []);

  const saveUserMemory = useCallback(async (memory: string) => {
    await AsyncStorage.setItem("jarvis_user_memory", memory);
  }, []);

  return (
    <JarvisContext.Provider
      value={{
        isActivated,
        isShutdown,
        isWakeLockEnabled,
        isPocketModeEnabled,
        isOffline,
        isLocked,
        currentModel,
        billDisplay,
        userName,
        pin,
        messages,
        activate,
        deactivate,
        addMessage,
        updateBill,
        switchToProMode,
        switchToFlashMode,
        setWakeLockEnabled,
        setPocketModeEnabled,
        setOffline,
        triggerShutdown,
        setIsLocked,
        saveUserMemory,
      }}
    >
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvis(): JarvisContextType {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used within JarvisProvider");
  return ctx;
}
