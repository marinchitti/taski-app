import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    boxShadow: [{
      offsetX: 0,
      offsetY: 1,
      blurRadius: 2,
      color: "rgba(0,0,0,0.05)",
    }],
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },
  iconContainer: {
    marginTop: 8,
  },
});

export default StatsCard;
