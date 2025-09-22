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
import InputField from "@/components/ui/InputField";

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
}

export default function RegisterScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [form, setForm] = useState<RegisterForm>({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const colors = "light";

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

  useEffect(() => {
    validateField("confirmPassword", form.confirmPassword);
  }, [form.confirmPassword]);

  useEffect(() => {
    validateField("name", form.name);
  }, [form.name]);

  const validateField = (field: keyof RegisterForm, value: string) => {
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
        } else if (value.length < 6) {
          newErrors.password = "비밀번호는 최소 6자 이상이어야 합니다";
        } else if (!/(?=.*[a-z])/.test(value)) {
          newErrors.password = "소문자를 포함해야 합니다";
        } else if (!/(?=.*[0-9])/.test(value)) {
          newErrors.password = "숫자를 포함해야 합니다";
        } else if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(value)) {
          newErrors.password = "특수문자를 포함해야 합니다";
        } else {
          delete newErrors.password;
        }
        break;
        // else if (!/(?=.*[A-Z])/.test(value)) {
        //   newErrors.password = "대문자를 포함해야 합니다";
        // } else if (/123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(value)) {
        //   newErrors.password = "연속된 3자 이상의 문자나 숫자는 사용할 수 없습니다";
        // } else

      case "confirmPassword":
        if (!value) {
          newErrors.confirmPassword = "비밀번호를 다시 입력해주세요";
        } else if (value !== form.password) {
          newErrors.confirmPassword = "비밀번호가 일치하지 않습니다";
        } else {
          delete newErrors.confirmPassword;
        }
        break;

      case "name":
        if (!value) {
          newErrors.name = "이름을 입력해주세요";
        } else if (value.length < 2) {
          newErrors.name = "이름은 최소 2자 이상이어야 합니다";
        } else {
          delete newErrors.name;
        }
        break;
    }

    setErrors(newErrors);
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    // if (/(?=.*[A-Z])/.test(password)) score++;
    if (/(?=.*[a-z])/.test(password)) score++;
    if (/(?=.*[0-9])/.test(password)) score++;
    if (/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) score++;
    
    // 연속된 문자/숫자가 있으면 점수 감점
    // if (/123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)) {
    //   score = Math.max(0, score - 1);
    // }

    if (score === 0) return { text: "매우 약함", color: "#ff4444", score: 0 };
    if (score === 1) return { text: "약함", color: "#ff8800", score: 1 };
    if (score === 2) return { text: "보통", color: "#ffaa00", score: 2 };
    if (score === 3) return { text: "강함", color: "#00aa00", score: 3 };
    if (score === 4) return { text: "좋음", color: "#008800", score: 4 };
    return { text: "매우 강함", color: "#006600", score: 5 };
  };

  const isFormValid = () => {
    return (
      form.email &&
      form.password &&
      form.confirmPassword &&
      form.name &&
      Object.keys(errors).length === 0
    );
  };

  const handleRegister = async () => {
    if (!isFormValid()) {
      Alert.alert("입력 오류", "모든 필드를 올바르게 입력해주세요");
      return;
    }

    setIsLoading(true);
    try {
      const { register, clearSecureStore } = await import("@/src/auth");
      
      // 회원가입 전 SecureStore 초기화
      await clearSecureStore();
      const result = await register({
        email: form.email,
        password: form.password,
        name: form.name,
      });
      
      console.log("회원가입 결과:", result);
      
      // 응답 데이터 안전하게 처리
      const message = result?.message || "회원가입이 완료되었습니다. 로그인해주세요.";
      
      Alert.alert(
        "회원가입 성공",
        message,
        [
          {
            text: "확인",
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (error: any) {
      let errorMessage = "회원가입에 실패했습니다";
      
      if (error?.response?.status === 409) {
        // errorMessage = "이미 존재하는 이메일입니다";
      } else if (error?.response?.status === 400) {
        errorMessage = "입력 정보를 확인해주세요";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("회원가입 실패", errorMessage);
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

        <View style={{ marginTop: 30, marginBottom: 100}}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "light",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            회원가입
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#666",
              textAlign: "center",
            }}
          >
            계정을 생성하고 서비스를 이용해보세요
          </Text>
        </View>

        <InputField
          label="이름"
          value={form.name}
          onChangeText={(text) => setForm({ ...form, name: text })}
          placeholder="이름을 입력하세요"
          error={errors.name}
          autoCapitalize="words"
        />

        <View style={{ marginTop: 5 }} />

        <InputField
          label="이메일"
          value={form.email}
          onChangeText={(text) => setForm({ ...form, email: text })}
          placeholder="이메일을 입력하세요"
          error={errors.email}
          keyboardType="email-address"
        />

        <View style={{ marginTop: 5 }} />

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

        {form.password && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
              비밀번호 강도:{" "}
              <Text style={{ color: getPasswordStrength(form.password).color }}>
                {getPasswordStrength(form.password).text}
              </Text>
            </Text>
            <View
              style={{
                flexDirection: "row",
                height: 4,
                backgroundColor: "#eee",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              {[1, 2, 3, 4].map((index) => (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    backgroundColor:
                      index <= getPasswordStrength(form.password).score
                        ? getPasswordStrength(form.password).color
                        : "#eee",
                    marginRight: index < 4 ? 2 : 0,
                  }}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 5 }} />

        <InputField
          label="비밀번호 확인"
          value={form.confirmPassword}
          onChangeText={(text) => setForm({ ...form, confirmPassword: text })}
          placeholder="비밀번호를 다시 입력하세요"
          secureTextEntry={!showConfirmPassword}
          error={errors.confirmPassword}
          icon={showConfirmPassword ? "eye-off" : "eye"}
          onIconPress={() => setShowConfirmPassword(!showConfirmPassword)}
        />

        <TouchableOpacity
          style={{
            backgroundColor: isFormValid() ? "#398CF0" : "#ccc",
            paddingVertical: 16,
            borderRadius: 12,
            marginTop: 24,
            marginBottom: 16,
          }}
          onPress={handleRegister}
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
            {isLoading ? "처리중..." : "회원가입"}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center" }}>
          <Text style={{ color: "#666", fontSize: 16 }}>
            이미 계정이 있으신가요?{" "}
          </Text>
          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              로그인
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
