import { supabase } from "@/config/supabaseConfig";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../../components/icons";

const TAB_BAR_HEIGHT = 60;
const TAB_BAR_PADDING = 10;
const TAB_BAR_ITEM_GAP = 14;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const existingChannel = supabase.channel("tasks-db-changes");
    supabase.removeChannel(existingChannel);

    const channel = supabase
      .channel("tasks-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          console.log("Change received!", payload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#B1B8C7",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: TAB_BAR_PADDING,
          paddingBottom: TAB_BAR_PADDING + insets.bottom,
          // React Navigation stretches every tab with `flex: 1`. Centering the
          // bar's content lets the row shrink to its own width, and each tab
          // (see `tabBarItemStyle`) only takes the room its icon + label needs,
          // so the tabs stay close together in the middle of the bar.
          alignItems: "center",
        },
        tabBarItemStyle: {
          // `flex: -1` (not 0) is the cross-platform "size to own content, but
          // allowed to shrink" value: Yoga keeps `basis: auto` for any flex <= 0,
          // while react-native-web turns `flex: 0` into CSS `flex: 0` (= `flex-basis: 0%`),
          // which would collapse the tabs to zero width on web.
          flex: -1,
          marginHorizontal: TAB_BAR_ITEM_GAP,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name="checkbox" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name="calendar" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Team",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "bar-chart" : "bar-chart-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
