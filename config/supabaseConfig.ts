import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = "https://uhdcspjpxbaevklerfbh.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoZGNzcGpweGJhZXZrbGVyZmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTM3MjIsImV4cCI6MjEwNDM2OTcyMn0.TLqYoSwno5ST31xkr-vWIWxzFktncizUabWwdV1AYdo";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:
      Platform.OS !== "web" || typeof window !== "undefined"
        ? AsyncStorage
        : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
