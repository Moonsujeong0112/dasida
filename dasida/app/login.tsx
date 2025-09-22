import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { login, clearSecureStore } from "@/src/auth";
import InputField from "@/components/ui/InputField";

interface LoginForm {
  email: string;
  password: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
}

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    password: "",
  });
  
  // 컴포넌트 마운트 시 SecureStore 초기화
  useEffect(() => {
    clearSecureStore().catch(console.error);
  }, []);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const colors ="light";

  // 키보드 이벤트 리스너 - 모든 플랫폼 대응
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      // 태블릿의 경우 키보드 높이를 더 크게 감지
      const adjustedHeight = Platform.OS === 'ios' ? e.endCoordinates.height : e.endCoordinates.height + 50;
      setKeyboardHeight(adjustedHeight);
    });
    
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    // Android에서 추가 이벤트 리스너
    const keyboardWillShowListener = Keyboard.addListener('keyboardWillShow', (e) => {
      if (Platform.OS === 'android') {
        setKeyboardHeight(e.endCoordinates.height + 30);
      }
    });

    const keyboardWillHideListener = Keyboard.addListener('keyboardWillHide', () => {
      if (Platform.OS === 'android') {
        setKeyboardHeight(0);
      }
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // 실시간 검증
  useEffect(() => {
    validateField("email", form.email);
  }, [form.email]);

  useEffect(() => {
    validateField("password", form.password);
  }, [form.password]);

  const validateField = (field: keyof LoginForm, value: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case "email":
        if (!value) {
          newErrors.email = "이메일을 입력해주세요";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          newErrors.email = "올바른 이메일 형식이 아닙니다";
        } else {
          delete newErrors.email;
        }
        break;

      case "password":
        if (!value) {
          newErrors.password = "비밀번호를 입력해주세요";
        } else {
          delete newErrors.password;
        }
        break;
    }

    setErrors(newErrors);
  };

  const isFormValid = () => {
    return form.email && form.password && Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    if (!isFormValid()) {
      Alert.alert("입력 오류", "모든 필드를 올바르게 입력해주세요");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(form.email, form.password);
      console.log("로그인 결과:", result);
      
      // 응답 데이터 안전하게 처리
      if (result?.message) {
        Alert.alert("로그인 성공", result.message, [
          {
            text: "확인",
            onPress: () => router.replace("/bookshelf" as any),
          },
        ]);
      } else {
        router.replace("/bookshelf" as any);
      }
    } catch (error: any) {
      let errorMessage = "로그인에 실패했습니다";
      
      if (error?.response?.status === 401) {
        errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다";
      } else if (error?.response?.status === 400) {
        errorMessage = "입력 정보를 확인해주세요";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("로그인 실패", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 40}
    >
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: '#ffffff',
        }}
        contentContainerStyle={{ 
          padding: 20,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 40 : 20,
          minHeight: '100%'
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header Image */}
        <View style={{ alignItems: "center", marginTop: 50, marginBottom: 10 }}>
          <Image 
            source={require('@/assets/images/DasiDa_logo.png')} 
            style={{ width: 200 }}
            resizeMode="contain"
          />
        </View>

        <View style={{ marginTop: 30, marginBottom: 170 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "light",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            로그인
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#666",
              textAlign: "center",
            }}
          >
            계정에 로그인하여 서비스를 이용하세요
          </Text>
        </View>

        <InputField
          label="이메일"
          value={form.email}
          onChangeText={(text) => setForm({ ...form, email: text })}
          placeholder="이메일을 입력하세요"
          error={errors.email}
          keyboardType="email-address"
        />

        <View style={{ marginTop: 20 }} />

        <InputField
          label="비밀번호"
          value={form.password}
          onChangeText={(text) => setForm({ ...form, password: text })}
          placeholder="비밀번호를 입력하세요"
          secureTextEntry={!showPassword}
          error={errors.password}
          icon={showPassword ? "eye-off" : "eye"}
          onIconPress={() => setShowPassword(!showPassword)}
        />

        <TouchableOpacity
          style={{
            backgroundColor: isFormValid() ? "#398CF0" : "#ccc",
            paddingVertical: 16,
            borderRadius: 12,
            marginTop: 24,
            marginBottom: 16,
          }}
          onPress={handleLogin}
          disabled={!isFormValid() || isLoading}
        >
          <Text
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center" }}>
          <Text style={{ color: "#666", fontSize: 16 }}>
            계정이 없으신가요?{" "}
          </Text>
          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text
              style={{
                color: colors.tint,
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              회원가입
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

