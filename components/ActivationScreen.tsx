import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useJarvis } from "@/contexts/JarvisContext";
import { pingGeminiProxy } from "@/services/geminiService";
import { saveServerUrl } from "@/services/serverConfig";

export function ActivationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activate } = useJarvis();

  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [serverStatus, setServerStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [glowAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (domain) {
      const url = `https://${domain}`;
      setServerUrl(url);
      checkServer(url);
    }
  }, []);

  const checkServer = async (url?: string) => {
    const target = url || serverUrl;
    if (!target.trim()) {
      setServerStatus("idle");
      return;
    }
    setServerStatus("checking");
    const cleanUrl = target.trim().replace(/\/$/, "");
    await saveServerUrl(cleanUrl);
    const ok = await pingGeminiProxy();
    setServerStatus(ok ? "ok" : "error");
  };

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] });

  const handleActivate = async () => {
    if (!ownerName.trim()) {
      Alert.alert("ত্রুটি", "আপনার নাম দিন, স্যার।");
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      Alert.alert("ত্রুটি", "৪ সংখ্যার PIN দিন।");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("ত্রুটি", "PIN দুটি মিলছে না।");
      return;
    }
    if (!serverUrl.trim()) {
      Alert.alert("ত্রুটি", "Server URL দিন।");
      return;
    }

    setIsValidating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const cleanUrl = serverUrl.trim().replace(/\/$/, "");
      await saveServerUrl(cleanUrl);
      const ok = await pingGeminiProxy();
      if (!ok) {
        setIsValidating(false);
        Alert.alert(
          "সার্ভার পাওয়া যাচ্ছে না",
          "এই URL-এ Jarvis AI সার্ভার পাওয়া যাচ্ছে না। Replit-এ app publish করার পর আবার চেষ্টা করুন।\n\nURL: " + cleanUrl
        );
        return;
      }
      await activate(ownerName.trim(), pin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setIsValidating(false);
      Alert.alert("সমস্যা", "সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
  };

  const statusColor = {
    idle: colors.border,
    checking: colors.warning,
    ok: colors.success,
    error: colors.destructive,
  }[serverStatus];

  const statusText = {
    idle: "URL দিন এবং চেক করুন",
    checking: "সার্ভার চেক করা হচ্ছে...",
    ok: "✅ AI ব্রেইন সংযুক্ত — API Key নিরাপদে সার্ভারে লক",
    error: "❌ সার্ভার পাওয়া যাচ্ছে না — URL চেক করুন",
  }[serverStatus];

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Animated.View
            style={[styles.glowRing, { backgroundColor: colors.primary, opacity: glowOpacity }]}
          />
          <View style={[styles.logoCircle, { borderColor: colors.primary }]}>
            <Text style={[styles.logoText, { color: colors.primary }]}>J</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>JARVIS</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Just A Rather Very Intelligent System
          </Text>
          <View style={[styles.badge, { borderColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>SECURE ACTIVATION</Text>
          </View>
        </View>

        <View style={styles.form}>
          {/* Server URL */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              JARVIS SERVER URL
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: serverStatus === "ok" ? colors.success : serverStatus === "error" ? colors.destructive : colors.border }]}>
              <TextInput
                style={[styles.inputFlex, { color: colors.foreground }]}
                value={serverUrl}
                onChangeText={(t) => { setServerUrl(t); setServerStatus("idle"); }}
                placeholder="https://your-app.replit.app"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!isValidating}
              />
              <Pressable
                onPress={() => checkServer()}
                disabled={!serverUrl.trim() || serverStatus === "checking" || isValidating}
                style={[styles.checkBtn, { backgroundColor: colors.primary, opacity: !serverUrl.trim() ? 0.4 : 1 }]}
              >
                {serverStatus === "checking" ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.checkBtnText}>চেক</Text>
                )}
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: statusColor }]}>{statusText}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>
              Replit-এ Publish করার পর যে URL পাবেন সেটা দিন
            </Text>
          </View>

          {/* Owner Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>আপনার নাম</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: ownerName ? colors.primary : colors.border, color: colors.foreground }]}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="যেমন: রাহুল"
              placeholderTextColor={colors.mutedForeground}
              editable={!isValidating}
            />
          </View>

          {/* PIN */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>৪-সংখ্যার সিক্রেট PIN তৈরি করুন</Text>
            <TextInput
              style={[styles.input, styles.pinInput, { backgroundColor: colors.card, borderColor: pin.length === 4 ? colors.primary : colors.border, color: colors.foreground }]}
              value={pin}
              onChangeText={(t) => { if (/^\d{0,4}$/.test(t)) setPin(t); }}
              placeholder="● ● ● ●"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              editable={!isValidating}
            />
          </View>

          {/* Confirm PIN */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>PIN আবার দিন (নিশ্চিত করুন)</Text>
            <TextInput
              style={[
                styles.input,
                styles.pinInput,
                {
                  backgroundColor: colors.card,
                  borderColor: confirmPin.length === 4 ? (confirmPin === pin ? colors.success : colors.destructive) : colors.border,
                  color: colors.foreground,
                },
              ]}
              value={confirmPin}
              onChangeText={(t) => { if (/^\d{0,4}$/.test(t)) setConfirmPin(t); }}
              placeholder="● ● ● ●"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              editable={!isValidating}
            />
          </View>

          <Pressable
            onPress={handleActivate}
            disabled={isValidating || serverStatus !== "ok"}
            style={({ pressed }) => [
              styles.activateBtn,
              {
                backgroundColor: serverStatus === "ok" ? colors.primary : colors.muted,
                opacity: pressed || isValidating ? 0.7 : 1,
              },
            ]}
          >
            {isValidating ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#000" size="small" />
                <Text style={[styles.activateBtnText, { color: "#000", marginLeft: 10 }]}>যাচাই হচ্ছে...</Text>
              </View>
            ) : (
              <Text style={[styles.activateBtnText, { color: serverStatus === "ok" ? colors.primaryForeground : colors.mutedForeground }]}>
                JARVIS চালু করুন
              </Text>
            )}
          </Pressable>

          <View style={[styles.securityNote, { backgroundColor: "rgba(0,212,255,0.05)" }]}>
            <Text style={[styles.securityText, { color: colors.mutedForeground }]}>
              🔒 Gemini API Key সার্ভারের Replit Secret-এ এনক্রিপ্টেড।{"\n"}
              App বা APK-এ কখনো আসে না — কেউ দেখতে পাবে না।
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: "center", marginBottom: 28 },
  glowRing: { position: "absolute", width: 100, height: 100, borderRadius: 50, top: -8 },
  logoCircle: { width: 84, height: 84, borderRadius: 42, borderWidth: 2.5, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoText: { fontSize: 40, fontWeight: "800", fontFamily: "Inter_700Bold" },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: 8, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, letterSpacing: 1, marginTop: 4, marginBottom: 12, fontFamily: "Inter_400Regular" },
  badge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, letterSpacing: 2, fontFamily: "Inter_500Medium" },
  form: { gap: 18 },
  fieldGroup: { gap: 7 },
  label: { fontSize: 11, letterSpacing: 1.5, fontFamily: "Inter_600SemiBold" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingLeft: 14, overflow: "hidden" },
  inputFlex: { flex: 1, height: 52, fontSize: 14, fontFamily: "Inter_400Regular" },
  checkBtn: { height: 52, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  checkBtnText: { fontSize: 13, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
  input: { height: 52, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
  pinInput: { letterSpacing: 8, fontSize: 20, textAlign: "center" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  activateBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  activateBtnText: { fontSize: 16, fontWeight: "700", letterSpacing: 1, fontFamily: "Inter_700Bold" },
  loadingRow: { flexDirection: "row", alignItems: "center" },
  securityNote: { padding: 14, borderRadius: 10 },
  securityText: { fontSize: 11, textAlign: "center", lineHeight: 18, fontFamily: "Inter_400Regular" },
});
