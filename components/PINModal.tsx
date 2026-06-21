import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  onFailed: () => void;
  correctPin: string;
  isLockout?: boolean;
  lockoutMinutes?: number;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["⌫", "0", "✕"],
];

export function PINModal({
  visible,
  onSuccess,
  onCancel,
  onFailed,
  correctPin,
  isLockout,
  lockoutMinutes,
}: Props) {
  const colors = useColors();
  const [entered, setEntered] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) setEntered("");
  }, [visible]);

  useEffect(() => {
    if (entered.length === 4) {
      if (entered === correctPin) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        setEntered("");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Animated.sequence([
          Animated.timing(shakeAnim, {
            toValue: 10,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: -10,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 6,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnim, {
            toValue: 0,
            duration: 60,
            useNativeDriver: true,
          }),
        ]).start();
        setEntered("");
        onFailed();
      }
    }
  }, [entered]);

  const handleKey = (key: string) => {
    if (isLockout) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === "⌫") {
      setEntered((p) => p.slice(0, -1));
    } else if (key === "✕") {
      onCancel();
    } else if (entered.length < 4) {
      setEntered((p) => p + key);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {isLockout ? (
            <>
              <Text style={[styles.title, { color: colors.destructive }]}>
                🔒 লক হয়েছে
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {lockoutMinutes} মিনিট পরে আবার চেষ্টা করুন, স্যার।
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>
                🔐 PIN যাচাই
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                নিরাপত্তা নিশ্চিত করুন, স্যার
              </Text>

              <Animated.View
                style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}
              >
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i < entered.length
                            ? colors.primary
                            : colors.secondary,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                ))}
              </Animated.View>

              <View style={styles.keypad}>
                {KEYS.map((row, ri) => (
                  <View key={ri} style={styles.row}>
                    {row.map((key) => (
                      <Pressable
                        key={key}
                        onPress={() => handleKey(key)}
                        style={({ pressed }) => [
                          styles.key,
                          {
                            backgroundColor: pressed
                              ? colors.secondary
                              : colors.muted,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.keyText,
                            {
                              color:
                                key === "✕"
                                  ? colors.destructive
                                  : colors.foreground,
                            },
                          ]}
                        >
                          {key}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: 320,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 24,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  dots: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  keypad: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  key: {
    width: 72,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
