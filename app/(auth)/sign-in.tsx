import { Ionicons } from "../../components/icons";
import { Link } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Logo from "../../components/Logo";
import { useAuth } from "../../context/auth";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();

  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      setError("Enter your email and password.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await signIn(normalizedEmail, password);
    } catch (authError) {
      const message = (authError as { message?: string }).message ?? "";
      const normalizedMessage = message.toLowerCase();

      if (normalizedMessage.includes("email not confirmed")) {
        setError("Confirm your email first. Check your inbox or spam folder.");
      } else if (normalizedMessage.includes("invalid login credentials")) {
        setError(
          "Those credentials were not accepted. If you just registered, confirm your email first.",
        );
      } else if (
        normalizedMessage.includes("fetch") ||
        normalizedMessage.includes("network")
      ) {
        setError("Unable to reach Supabase. Check your internet connection.");
      } else {
        setError(message || "Unable to sign in. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setIsSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (authError) {
      const message = (authError as { message?: string }).message ?? "";
      setError(
        message.toLowerCase().includes("cancel")
          ? ""
          : "Unable to sign in with Google. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Logo size={60} />
          </View>

          <Text style={styles.title}>Log in to continue</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#6B7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!passwordVisible}
                autoComplete="password"
                textContentType="password"
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setPasswordVisible((visible) => !visible)}
                accessibilityLabel={
                  passwordVisible ? "Hide password" : "Show password"
                }
              >
                <Ionicons
                  name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.signInButton, isSubmitting && styles.disabledButton]}
            onPress={handleSignIn}
            disabled={isSubmitting}
          >
            <Text style={styles.signInText}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.dividerText}>Or continue with:</Text>

          <TouchableOpacity
            style={[styles.googleButton, isSubmitting && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            <Ionicons
              name="logo-google"
              size={19}
              color="#4285F4"
              style={styles.googleIcon}
            />
            <Text style={styles.googleButtonText}>
              {isSubmitting ? "Connecting..." : "Google"}
            </Text>
          </TouchableOpacity>

          {/* Navigation Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>No account? </Text>
            <Link href="/(auth)/sign-up" asChild>
              <TouchableOpacity>
                <Text style={styles.signUpLink}>Create one</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: 392,
    paddingHorizontal: 32,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 34,
    paddingHorizontal: 24,
    paddingVertical: 58,
    alignItems: "center",
    boxShadow: [{
      offsetX: 0,
      offsetY: 4,
      blurRadius: 12,
      color: "rgba(0,0,0,0.035)",
    }],
    elevation: 3,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1F2937",
    marginBottom: 28,
  },
  inputContainer: {
    width: "100%",
    gap: 7,
    marginBottom: 17,
  },
  fieldLabel: {
    color: "#1F2937",
    fontSize: 9,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 2,
  },
  input: {
    width: "100%",
    height: 36,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#D7CBCD",
    borderRadius: 9,
    paddingHorizontal: 13,
    fontSize: 11,
    color: "#1F2937",
  },
  passwordInputWrapper: {
    width: "100%",
    height: 36,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#D7CBCD",
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    paddingHorizontal: 13,
    fontSize: 11,
    color: "#1F2937",
  },
  passwordToggle: {
    width: 38,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  signInButton: {
    width: "100%",
    height: 36,
    backgroundColor: "#0F172A",
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 19,
  },
  signInText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    width: "100%",
    color: "#B91C1C",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  dividerText: {
    fontSize: 9,
    color: "#4B5563",
    marginBottom: 14,
  },
  googleButton: {
    width: "100%",
    height: 36,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7CBCD",
    borderRadius: 9,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
  },
  googleIcon: {
    marginRight: 6,
  },
  googleButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerText: {
    fontSize: 10,
    color: "#7B7F87",
  },
  signUpLink: {
    fontSize: 10,
    color: "#4F46E5",
    fontWeight: "600",
  },
});
