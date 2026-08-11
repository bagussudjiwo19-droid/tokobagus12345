import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, fontSize, radius, spacing } from "./theme";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (message: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, t: ToastType = "info") => {
      setMsg(message);
      setType(t);
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          () => setVisible(false),
        );
      }, 2600);
    },
    [opacity],
  );

  const color =
    type === "success" ? colors.brand : type === "error" ? colors.error : colors.surfaceTertiary;
  const icon =
    type === "success" ? "checkmark-circle" : type === "error" ? "alert-circle" : "information-circle";

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + spacing.md, opacity }]}
        >
          <View style={[styles.toast, { borderLeftColor: color }]} testID="app-toast">
            <Ionicons name={icon as any} size={20} color={color} />
            <Text style={styles.text} numberOfLines={3}>
              {msg}
            </Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 9999 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    maxWidth: 460,
    width: "100%",
  },
  text: { flex: 1, color: colors.onSurface, fontFamily: font.medium, fontSize: fontSize.base },
});
