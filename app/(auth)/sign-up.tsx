import { Ionicons } from "../../components/icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Logo from "../../components/Logo";
import { useAuth } from "../../context/auth";

export default function SignUpScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();

  const handleSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim() || !normalizedEmail || !password) {
      setError("Complete all fields.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Your password must be at least 6 characters.");
      return;
    }

    setError("");
    setIsCreated(false);
    setIsSubmitting(true);

    try {
      const result = await signUp(normalizedEmail, password, fullName.trim());
      setNeedsEmailConfirmation(result.emailConfirmationRequired);
      setIsCreated(true);
    } catch (authError) {
      const authResponse = authError as {
        message?: string;
        status?: number;
        code?: string;
      };
      const message = authResponse.message ?? "";
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("already registered") ||
        normalizedMessage.includes("already been registered")
      ) {
        setError("An account already exists for this email. Try signing in.");
      } else if (normalizedMessage.includes("password")) {
        setError(message);
      } else if (normalizedMessage.includes("email")) {
        setError(message);
      } else if (authResponse.status === 422) {
        setError(
          "Firebase rejected these details. Check the email and password and try again.",
        );
      } else {
        setError(message || "Unable to create your account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setIsSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (authError) {
      const message = (authError as { message?: string }).message ?? "";
      setError(
        message.toLowerCase().includes("cancel")
          ? ""
          : "Unable to continue with Google. Please try again.",
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Logo size={60} />
            </View>

            <Text style={styles.title}>
              {isCreated ? "Account created" : "Sign up to continue"}
            </Text>

            {isCreated ? (
              <View style={styles.successState}>
                <Ionicons name="checkmark-circle" size={42} color="#16A34A" />
                <Text style={styles.successText}>
                  {needsEmailConfirmation
                    ? "Check your email to confirm your account, then sign in."
                    : "Your account is ready. You can start using Taski now."}
                </Text>
                <TouchableOpacity
                  style={styles.signUpButton}
                  onPress={() =>
                    needsEmailConfirmation
                      ? router.replace("/(auth)/sign-in")
                      : router.replace("/(tabs)")
                  }
                >
                  <Text style={styles.signUpText}>
                    {needsEmailConfirmation ? "Go to sign in" : "Continue"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isCreated ? (
              <View style={styles.inputContainer}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  placeholderTextColor="#6B7280"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                />
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
                    autoComplete="new-password"
                    textContentType="newPassword"
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
            ) : null}

            {!isCreated && error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}

            {!isCreated ? (
              <TouchableOpacity
                style={[
                  styles.signUpButton,
                  isSubmitting && styles.disabledButton,
                ]}
                onPress={handleSignUp}
                disabled={isSubmitting}
              >
                <Text style={styles.signUpText}>
                  {isSubmitting ? "Signing up..." : "Sign up"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {!isCreated ? (
              <Text style={styles.dividerText}>Or continue with:</Text>
            ) : null}

            {!isCreated ? (
              <TouchableOpacity
                style={[
                  styles.googleButton,
                  isSubmitting && styles.disabledButton,
                ]}
                onPress={handleGoogleSignUp}
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
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/sign-in" asChild>
                <TouchableOpacity>
                  <Text style={styles.signInLink}>Log in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },
  card: {
    width: "84%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 34,
    paddingHorizontal: 23,
    paddingVertical: 56,
    alignItems: "center",
    boxShadow: [{
      offsetX: 0,
      offsetY: 4,
      blurRadius: 12,
      color: "rgba(0,0,0,0.05)",
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
    marginBottom: 19,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1F2937",
    marginBottom: 22,
    textAlign: "center",
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
  signUpButton: {
    width: "100%",
    height: 36,
    backgroundColor: "#0F172A",
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 19,
  },
  signUpText: {
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
  successState: {
    width: "100%",
    alignItems: "center",
    gap: 16,
    marginBottom: 8,
  },
  successText: {
    color: "#4B5563",
    fontSize: 12,
    lineHeight: 18,
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
  signInLink: {
    fontSize: 10,
    color: "#4F46E5",
    fontWeight: "600",
  },
});
