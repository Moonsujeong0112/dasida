import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { getAccessToken } from "@/src/auth";

export default function Index() {
  const colorScheme = useColorScheme();
  const colors = "light";
  const [pressedButton, setPressedButton] = useState<string | null>(null);

  // 로그인 상태 확인
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          // 이미 로그인되어 있으면 책장 페이지로 이동
          router.replace("/bookshelf" as any);
        }
      } catch (error) {
        console.log("토큰 확인 중 오류:", error);
      }
    };

    checkAuthStatus();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
        {/* 로고 및 제목 */}
        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/index_header.png')} 
            style={styles.headerImage}
            resizeMode="contain"
          />
        </View>

        {/* 버튼 영역 */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.button, 
              styles.loginButton, 
              { 
                borderColor: '#398CF0',
                backgroundColor: pressedButton === 'login' ? '#398CF0' : 'transparent'
              }
            ]}
            onPressIn={() => setPressedButton('login')}
            onPressOut={() => setPressedButton(null)}
            onPress={() => router.push("/login")}
          >
            <Ionicons 
              name="log-in" 
              size={25} 
              color={pressedButton === 'login' ? 'white' : '#398CF0'} 
            />
            <Text style={[
              styles.buttonText, 
              { color: pressedButton === 'login' ? 'white' : '#398CF0' }
            ]}>로그인</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button, 
              styles.registerButton, 
              { 
                borderColor: '#398CF0',
                backgroundColor: pressedButton === 'register' ? '#398CF0' : 'transparent'
              }
            ]}
            onPressIn={() => setPressedButton('register')}
            onPressOut={() => setPressedButton(null)}
            onPress={() => router.push("/register")}
          >
            <Ionicons 
              name="person-add" 
              size={24} 
              color={pressedButton === 'register' ? 'white' : '#398CF0'} 
            />
            <Text style={[
              styles.buttonText, 
              { color: pressedButton === 'register' ? 'white' : '#398CF0' }
            ]}>회원가입</Text>
          </TouchableOpacity>
        </View>

        {/* 추가 정보 */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: "#999" }]}>
            계정이 없으시다면 회원가입을 진행해주세요
          </Text>
        </View>

        {/* Footer Image */}
        <View style={styles.footerImageContainer}>
          <Image 
            source={require('@/assets/images/index_footer.png')} 
            style={styles.footerImage}
            resizeMode="contain"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  header: {
    alignItems: "center",
    marginTop: -200,
    marginBottom: 200,
  },
  headerImage: {
    width: 350,
  },
  buttonContainer: {
    width: "100%",
    gap: 24,
    marginBottom: 40,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 30,
    borderWidth: 2,
    minHeight: 56,
  },
  loginButton: {
    backgroundColor: "transparent",
  },
  registerButton: {
    backgroundColor: "transparent",
  },
  buttonText: {
    fontSize: 22,
    fontWeight: "600",
    marginLeft: 12,
    color: "white",
  },
  footer: {
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  footerImageContainer: {
    alignItems: "center",
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerImage: {
    width: '100%',
    flex: 1,
  },
});
