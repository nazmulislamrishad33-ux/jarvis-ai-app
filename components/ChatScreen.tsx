import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Battery from "expo-battery";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as KeepAwake from "expo-keep-awake";
import * as Linking from "expo-linking";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useJarvis, type Message } from "@/contexts/JarvisContext";
import {
  callGemini,
  detectAutoTrigger,
  detectProTrigger,
  detectShutdown,
  type GeminiModel,
} from "@/services/geminiService";
import {
  clearWrongPinCount,
  getLockoutRemainingMinutes,
  isDangerousCommand,
  isLockedOut,
  maskSensitiveData,
  recordWrongPin,
} from "@/services/securityFilters";
import { MessageBubble } from "./MessageBubble";
import { PINModal } from "./PINModal";
import { VoiceButton } from "./VoiceButton";

interface ConvMsg {
  role: "user" | "model";
  parts: { text: string }[];
}

let wakeLockTag: string | null = null;

export function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    messages,
    addMessage,
    updateBill,
    billDisplay,
    userName,
    pin,
    currentModel,
    isWakeLockEnabled,
    isPocketModeEnabled,
    isOffline,
    isShutdown,
    switchToProMode,
    switchToFlashMode,
    setWakeLockEnabled,
    setPocketModeEnabled,
    setOffline,
    triggerShutdown,
    deactivate,
  } = useJarvis();

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);
  const [lockoutMins, setLockoutMins] = useState(0);
  const [pendingMessage, setPendingMessage] = useState("");
  const [convHistory, setConvHistory] = useState<ConvMsg[]>([]);
  const [clipboardTimer, setClipboardTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [batteryLevel, setBatteryLevel] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Battery.getBatteryLevelAsync().then((level) => {
        setBatteryLevel(level);
      });
      const sub = Battery.addBatteryLevelListener(({ batteryLevel: lvl }) => {
        setBatteryLevel(lvl);
        if (lvl < 0.2 && isWakeLockEnabled) {
          setWakeLockEnabled(false);
          addSystemMessage("স্যার, ব্যাটারি ২০% এর নিচে। Wake-lock বন্ধ করা হয়েছে।");
        }
      });
      return () => sub.remove();
    }
  }, [isWakeLockEnabled]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      if (isWakeLockEnabled) {
        wakeLockTag = "jarvis-wake";
        KeepAwake.activateKeepAwakeAsync(wakeLockTag);
      } else {
        if (wakeLockTag) {
          KeepAwake.deactivateKeepAwake(wakeLockTag);
          wakeLockTag = null;
        }
      }
    }
  }, [isWakeLockEnabled]);

  useEffect(() => {
    if (Platform.OS !== "web" && isPocketModeEnabled) {
      let sub: any;
      try {
        sub = Magnetometer.addListener(() => {});
      } catch {}
      return () => sub?.remove?.();
    }
  }, [isPocketModeEnabled]);

  const checkConnectivity = async () => {
    try {
      const res = await fetch("https://www.google.com", {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      setOffline(!res.ok);
    } catch {
      setOffline(true);
    }
  };

  const addSystemMessage = useCallback(
    (text: string) => {
      const msg: Message = {
        id: `sys_${Date.now()}`,
        role: "assistant",
        text,
        timestamp: Date.now(),
      };
      addMessage(msg);
    },
    [addMessage]
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = (text || inputText).trim();
      if (!messageText || isLoading) return;

      if (isOffline) {
        addSystemMessage(
          "স্যার, আমি এই মুহূর্তে অফলাইনে আছি। আমার সেন্ট্রাল ব্রেইনে অ্যাক্সেস নেই, তবে আমি আপনার ডিভাইসের স্থানীয় মেমোরি পর্যবেক্ষণ করছি।"
        );
        return;
      }

      if (detectShutdown(messageText)) {
        await handleShutdown();
        return;
      }

      const masked = maskSensitiveData(messageText);

      if (isDangerousCommand(messageText)) {
        setPendingMessage(masked);
        const locked = await isLockedOut();
        if (locked) {
          const mins = await getLockoutRemainingMinutes();
          setLockoutMins(mins);
          setPinLocked(true);
        }
        setShowPINModal(true);
        return;
      }

      await processMessage(masked);
    },
    [inputText, isLoading, isOffline]
  );

  const processMessage = useCallback(
    async (messageText: string) => {
      setInputText("");
      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMsg: Message = {
        id: `u_${Date.now()}`,
        role: "user",
        text: messageText,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const autoTrigger = detectAutoTrigger(messageText);
      if (autoTrigger) {
        await handleAutoTrigger(autoTrigger.type, autoTrigger.payload, messageText);
        setIsLoading(false);
        return;
      }

      let model: GeminiModel = currentModel;
      if (detectProTrigger(messageText)) {
        switchToProMode();
        model = "gemini-1.5-pro";
      }

      try {
        const response = await callGemini(
          messageText,
          model,
          userName,
          convHistory
        );

        const assistantMsg: Message = {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: response.text,
          timestamp: Date.now(),
        };
        addMessage(assistantMsg);

        setConvHistory((prev) => [
          ...prev,
          { role: "user", parts: [{ text: messageText }] },
          { role: "model", parts: [{ text: response.text }] },
        ]);

        await updateBill(response.model, response.inputTokens, response.outputTokens);

        if (model === "gemini-1.5-pro") {
          setTimeout(() => switchToFlashMode(), 2000);
        }

        speakResponse(response.text);

        if (messageText.toLowerCase().includes("কপি") || messageText.toLowerCase().includes("copy")) {
          await handleClipboard(response.text);
        }
      } catch (err: any) {
        addSystemMessage(`স্যার, একটি সমস্যা হয়েছে: ${err?.message || "অজানা ত্রুটি"}`);
      } finally {
        setIsLoading(false);
      }
    },
    [apiKey, userName, convHistory, currentModel]
  );

  const speakResponse = (text: string) => {
    if (Platform.OS === "web") return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, {
      language: "bn-BD",
      pitch: 1.0,
      rate: 1.0,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    addSystemMessage(
      "স্যার, টেক্সট ক্লিপবোর্ডে কপি করা হয়েছে। যেকোনো জায়গায় পেস্ট করুন। ৬০ সেকেন্ড পরে স্বয়ংক্রিয়ভাবে মুছে যাবে।"
    );
    if (clipboardTimer) clearTimeout(clipboardTimer);
    const timer = setTimeout(async () => {
      await Clipboard.setStringAsync("");
    }, 60000);
    setClipboardTimer(timer);
    if (Platform.OS !== "web") {
      Speech.speak("স্যার, ক্লিপবোর্ডে কপি হয়েছে। পেস্ট করুন।", { language: "bn-BD" });
    }
  };

  const handleAutoTrigger = async (type: string, payload: string, original: string) => {
    let reply = "";
    try {
      if (type === "youtube") {
        const query = original.replace(/ইউটিউবে|youtube.*চালাও|youtube/gi, "").trim();
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        await Linking.openURL(url);
        reply = `স্যার, ইউটিউবে "${query}" খোঁজা হচ্ছে।`;
      } else if (type === "call" && payload) {
        await Linking.openURL(`tel:${payload}`);
        reply = `স্যার, ${payload} নম্বরে ডায়াল করা হচ্ছে।`;
      } else if (type === "whatsapp" && payload) {
        await Linking.openURL(`whatsapp://send?phone=${payload}`);
        reply = `স্যার, WhatsApp খোলা হচ্ছে।`;
      } else {
        reply = await (async () => {
          const r = await callGemini(original, "gemini-1.5-flash", userName, convHistory);
          return r.text;
        })();
      }
    } catch {
      reply = "স্যার, কাজটি সম্পন্ন করা যায়নি।";
    }
    addMessage({ id: `a_${Date.now()}`, role: "assistant", text: reply, timestamp: Date.now() });
    if (Platform.OS !== "web") speakResponse(reply);
  };

  const handleShutdown = async () => {
    const shutdownMsg = "স্যার, আমি বন্ধ হয়ে যাচ্ছি। সব লিসেনার বন্ধ করা হচ্ছে।";
    addSystemMessage(shutdownMsg);
    if (Platform.OS !== "web") {
      await Speech.speak(shutdownMsg, { language: "bn-BD" });
    }
    setTimeout(() => {
      triggerShutdown();
    }, 2000);
  };

  const handleScreenTap = () => {
    if (!isBlackScreen) return;
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 500);
    if (tapCount.current >= 2) {
      tapCount.current = 0;
      setIsBlackScreen(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const toggleWakeLock = () => {
    if (batteryLevel < 0.2 && !isWakeLockEnabled) {
      Alert.alert("ব্যাটারি কম", "ব্যাটারি ২০% এর নিচে। Wake-lock চালু করা নিরাপদ নয়।");
      return;
    }
    setWakeLockEnabled(!isWakeLockEnabled);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleBlackScreen = () => {
    setIsBlackScreen(!isBlackScreen);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePINSuccess = async () => {
    setShowPINModal(false);
    await clearWrongPinCount();
    if (pendingMessage) {
      const msg = pendingMessage;
      setPendingMessage("");
      await processMessage(msg);
    }
  };

  const handlePINFailed = async () => {
    const result = await recordWrongPin();
    if (result.locked) {
      const mins = await getLockoutRemainingMinutes();
      setLockoutMins(mins);
      setPinLocked(true);
    } else {
      Alert.alert(
        "ভুল PIN",
        `আর ${result.attemptsLeft} বার সুযোগ আছে। তারপর ৩০ মিনিটের জন্য লক।`
      );
    }
  };

  const isProMode = currentModel === "gemini-1.5-pro";

  if (isShutdown) {
    return (
      <View style={[styles.shutdownScreen, { backgroundColor: "#000" }]}>
        <Text style={[styles.shutdownText, { color: "#333" }]}>
          JARVIS OFFLINE
        </Text>
        <Text style={[styles.shutdownSub, { color: "#222" }]}>
          সমস্ত সেবা বন্ধ করা হয়েছে।
        </Text>
      </View>
    );
  }

  if (isBlackScreen) {
    return (
      <Pressable
        style={styles.blackScreen}
        onPress={handleScreenTap}
        onLongPress={() => setIsBlackScreen(false)}
      >
        <Text style={styles.blackHint}>দুইবার ট্যাপ করুন</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: isOffline ? colors.destructive : colors.success }]} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              JARVIS
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {isOffline ? "অফলাইন" : isProMode ? "Pro Mode" : "Flash Mode"}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.billChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.billText, { color: colors.primary }]}>
              Bill: {billDisplay}
            </Text>
          </View>
          {isProMode && (
            <View style={[styles.proBadge, { backgroundColor: colors.proColor }]}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
      </View>

      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.destructive }]}>
          <Text style={styles.offlineText}>
            স্যার, ইন্টারনেট সংযোগ নেই। স্থানীয় মেমোরি পর্যবেক্ষণ করছি।
          </Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          isLoading ? (
            <View style={styles.typingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.typingText, { color: colors.mutedForeground }]}>
                জারভিস উত্তর দিচ্ছে...
              </Text>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View style={styles.toolbarRow}>
            <Pressable
              onPress={toggleWakeLock}
              style={[
                styles.toolBtn,
                {
                  backgroundColor: isWakeLockEnabled
                    ? colors.primary + "33"
                    : colors.secondary,
                  borderColor: isWakeLockEnabled ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.toolBtnText, { color: isWakeLockEnabled ? colors.primary : colors.mutedForeground }]}>
                {isWakeLockEnabled ? "💡 ON" : "💤 OFF"}
              </Text>
            </Pressable>

            <Pressable
              onPress={toggleBlackScreen}
              style={[
                styles.toolBtn,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.toolBtnText, { color: colors.mutedForeground }]}>
                ⬛ ব্ল্যাক
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setPocketModeEnabled(!isPocketModeEnabled)}
              style={[
                styles.toolBtn,
                {
                  backgroundColor: isPocketModeEnabled
                    ? colors.warning + "33"
                    : colors.secondary,
                  borderColor: isPocketModeEnabled ? colors.warning : colors.border,
                },
              ]}
            >
              <Text style={[styles.toolBtnText, { color: isPocketModeEnabled ? colors.warning : colors.mutedForeground }]}>
                {isPocketModeEnabled ? "👜 ON" : "👜 OFF"}
              </Text>
            </Pressable>

            <Pressable
              onPress={deactivate}
              style={[
                styles.toolBtn,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.toolBtnText, { color: colors.destructive }]}>
                ⚙ রিসেট
              </Text>
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={
                isOffline
                  ? "অফলাইনে..."
                  : `জিজ্ঞেস করুন ${userName ? `${userName} স্যার` : "স্যার"}...`
              }
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={2000}
              editable={!isLoading}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
            />

            <VoiceButton
              isListening={isListening}
              disabled={isLoading || isOffline}
              onPress={async () => {
                if (isListening) {
                  setIsListening(false);
                  if (isSpeaking) Speech.stop();
                } else {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    "ভয়েস ইনপুট",
                    "ভয়েস রেকর্ডিং এই ডিভাইসে সক্রিয় করতে expo-av পার্মিশন প্রয়োজন। টেক্সটে টাইপ করুন।"
                  );
                }
              }}
            />

            {inputText.trim().length > 0 && (
              <Pressable
                onPress={() => handleSend()}
                disabled={isLoading}
                style={[
                  styles.sendBtn,
                  { backgroundColor: colors.primary, opacity: isLoading ? 0.5 : 1 },
                ]}
              >
                <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>
                  ↑
                </Text>
              </Pressable>
            )}
          </View>

          <View style={{ height: insets.bottom || 8 }} />
        </View>
      </KeyboardAvoidingView>

      <PINModal
        visible={showPINModal}
        correctPin={pin}
        isLockout={pinLocked}
        lockoutMinutes={lockoutMins}
        onSuccess={handlePINSuccess}
        onCancel={() => {
          setShowPINModal(false);
          setPendingMessage("");
          setPinLocked(false);
        }}
        onFailed={handlePINFailed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 3,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: "Inter_400Regular",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  billChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  billText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: "Inter_700Bold",
  },
  offlineBanner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  offlineText: {
    color: "#fff",
    fontSize: 11,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  messageList: {
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  toolbar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  toolbarRow: {
    flexDirection: "row",
    gap: 8,
  },
  toolBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  toolBtnText: {
    fontSize: 10,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: {
    fontSize: 20,
    fontWeight: "700",
  },
  blackScreen: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  blackHint: {
    color: "#111",
    fontSize: 12,
  },
  shutdownScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shutdownText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 4,
    fontFamily: "Inter_700Bold",
  },
  shutdownSub: {
    fontSize: 13,
    marginTop: 8,
    fontFamily: "Inter_400Regular",
  },
  success: {},
  warning: {},
  proColor: {},
});
