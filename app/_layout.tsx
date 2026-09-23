import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SplashScreen from "../components/SplashScreen";
import { AuthProvider, useAuth } from "../context/auth";
import { GroupProvider } from "../context/group";

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Controls minimum display time for the splash screen on launch
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  useEffect(() => {
    // Show splash screen for at least 2 seconds (adjust timing as needed)
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Wait until both authentication is checked AND splash screen duration finishes
    if (isLoading || isSplashVisible) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, isSplashVisible, segments, router]);

  // Display SplashScreen while loading auth OR during initial splash timer
  if (isLoading || isSplashVisible) {
    return <SplashScreen title="Welcome to TasKi" logoSize={88} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile"
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen
        name="settings"
        options={{ presentation: "modal", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="notifications"
        options={{ presentation: "modal", animation: "slide_from_right" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <GroupProvider>
          <RootLayoutNav />
        </GroupProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
