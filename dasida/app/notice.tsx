// test page for img

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function NoticeScreen() {
  const colorScheme = useColorScheme();
  const colors = "light";
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProblemImage();
  }, []);

  const loadProblemImage = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 여러 URL을 시도하여 이미지 로드
      const urls = [
        'http://52.79.233.106:80/uploads/problem_img/checkN_0818.png',        // Nginx(80) 경로
        // 'http://127.0.0.1:80/uploads/problem_img/checkN_0818.png',
        // 'http://host.docker.internal/uploads/problem_img/checkN_0818.png',
        // 'http://172.18.0.6/uploads/problem_img/checkN_0818.png',       // Nginx 컨테이너 IP가 80이면 :8080 제거
        // 'http://10.0.2.2:8080/uploads/problem_img/checkN_0818.png',    // Android Emulator
        // 'http://192.168.0.10:8080/uploads/problem_img/checkN_0818.png' // (예시) 맥/서버 내부IP
      ];
      
      
      let lastError = null;
      
      for (const url of urls) {
        try {
          console.log('🔄 이미지 URL 시도 중:', url);
          const response = await fetch(url, { method: 'HEAD' });
          console.log('📡 응답 상태:', response.status, response.statusText);
          
          if (response.ok) {
            console.log('✅ 이미지 URL 성공:', url);
            setImageUrl(url);
            return;
          } else {
            console.log('❌ HTTP 에러:', response.status, response.statusText);
            lastError = `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (error) {
          console.log('❌ 네트워크 에러:', url, error);
          console.log('에러 타입:', typeof error);
          console.log('에러 메시지:', (error as Error).message);
          console.log('에러 스택:', (error as Error).stack);
          lastError = (error as Error).message || 'Unknown error';
        }
      }
      
      // 모든 URL이 실패한 경우
      console.log('💥 모든 URL 시도 실패. 마지막 에러:', lastError);
      throw new Error(`모든 이미지 URL 시도 실패. 마지막 에러: ${lastError}`);
      
    } catch (err) {
      console.error("🔥 이미지 로드 최종 실패:", err);
      console.error("에러 타입:", typeof err);
      console.error("에러 메시지:", (err as Error).message);
      console.error("에러 스택:", (err as Error).stack);
      
      setError(`이미지를 불러올 수 없습니다. (${(err as Error).message})`);
      
      // 개발용 플레이스홀더 이미지 사용
      setImageUrl('https://via.placeholder.com/400x600/4A90E2/FFFFFF?text=Problem+Image');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleRefresh = () => {
    loadProblemImage();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          공지사항
        </Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* 컨텐츠 */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#398cf0" />
            <Text style={[styles.loadingText, { color: colors.text }]}>
              이미지를 불러오는 중...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#ff6b6b" />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {error}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : imageUrl ? (
          <View style={styles.imageContainer}>
            <Text style={[styles.imageTitle, { color: colors.text }]}>
              문제 이미지
            </Text>
            <Image
              source={{ uri: imageUrl }}
              style={styles.problemImage}
              resizeMode="contain"
              onError={() => {
                console.error("이미지 로드 실패");
                setError("이미지를 표시할 수 없습니다.");
              }}
            />
            <Text style={[styles.imageInfo, { color: colors.text }]}>
              checkN_0818.png
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 400,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 400,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#398cf0",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
  },
  imageContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  imageTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 20,
  },
  problemImage: {
    width: "100%",
    height: 400,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
  },
  imageInfo: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
});
