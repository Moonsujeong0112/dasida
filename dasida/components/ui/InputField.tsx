import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  error?: string;
  icon?: string;
  onIconPress?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
}

export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error,
  icon,
  onIconPress,
  autoCapitalize = "none",
  keyboardType = "default",
}: InputFieldProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: colors.text,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: error ? "#ff4444" : "#ddd",
          borderRadius: 12,
          paddingHorizontal: 16,
          backgroundColor: colors.background,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            paddingVertical: 16,
            fontSize: 16,
            color: colors.text,
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
        />
        {icon && (
          <TouchableOpacity onPress={onIconPress} style={{ padding: 8 }}>
            <Ionicons name={icon as any} size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text style={{ color: "#ff4444", fontSize: 14, marginTop: 4 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
