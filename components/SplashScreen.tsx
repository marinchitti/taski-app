import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";
import Logo from "./Logo"; // Make sure your Logo component is converted to React Native / SVG

interface SplashScreenProps {
  title?: string;
  subtitle?: string;
  logoSize?: number;
}

export default function SplashScreen({
  title = "Welcome to TasKi",
  subtitle = "Loading...",
  logoSize = 88,
}: SplashScreenProps) {
  // Shared animation values
  const containerOpacity = useSharedValue(0);
  const containerScale = useSharedValue(0.95);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);

  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(12);

  useEffect(() => {
    // Container entrance animation
    containerOpacity.value = withTiming(1, {
      duration: 500,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    containerScale.value = withTiming(1, {
      duration: 500,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });

    // Logo entrance animation
    logoOpacity.value = withTiming(1, {
      duration: 600,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    logoScale.value = withTiming(1, {
      duration: 600,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });

    // Text entrance animation (delayed)
    textOpacity.value = withDelay(
      200,
      withTiming(1, {
        duration: 400,
      }),
    );
    textTranslateY.value = withDelay(
      200,
      withTiming(0, {
        duration: 400,
      }),
    );
    // The shared values returned by useSharedValue are stable references
    // (backed by useState), so including them here does not re-run this
    // effect on re-renders — it still fires only once on mount.
  }, [
    containerOpacity,
    containerScale,
    logoOpacity,
    logoScale,
    textOpacity,
    textTranslateY,
  ]);

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Logo Wrapper with Drop Shadow */}
      <Animated.View style={[styles.shadowWrapper, logoAnimatedStyle]}>
        <Logo size={logoSize} />
      </Animated.View>

      {/* Text Wrapper */}
      <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  shadowWrapper: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 12,
        blurRadius: 16,
        color: "rgba(0,0,0,0.15)",
      },
    ],
    elevation: 10, // Shadow for Android
  },
  textContainer: {
    marginTop: 24,
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: "#0F172A", // slate-900
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#94A3B8", // slate-400
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 3,
  },
});
