import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Image,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { getUserInfo, logout, getAccessToken, storeUserInfo } from "@/src/auth";

interface UserInfo {
  name: string;
  email: string;
}

export default function BookshelfScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadUserInfo = async () => {
    try {
      console.log("=== 사용자 정보 로딩 시작 ===");
      const info = await getUserInfo();
      console.log("getUserInfo() 결과:", info);
      console.log("info의 타입:", typeof info);
      console.log("info가 null인가?", info === null);
      console.log("info가 undefined인가?", info === undefined);
      
      if (info) {
        console.log("사용자 정보 존재, 상태 업데이트 중...");
        console.log("info.name:", info.name);
        console.log("info.email:", info.email);
        setUserInfo(info);
        console.log("setUserInfo 호출 완료");
      } else {
        console.log("❌ 사용자 정보가 없습니다. API에서 가져오기 시도");
        await refreshUserInfoFromToken();
      }
    } catch (error) {
      console.error("❌ 사용자 정보 조회 오류:", error);
    }
  };

  const refreshUserInfoFromToken = async () => {
    try {
      // 백엔드 /api/me 엔드포인트를 통해 실제 사용자 정보 조회
      const token = await getAccessToken();
      if (token) {
        console.log("토큰으로 사용자 정보 API 호출");
        
        // API 호출로 실제 사용자 정보 가져오기
        const response = await fetch('http://52.79.233.106/api/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const apiResponse = await response.json();
          console.log("API에서 받은 응답:", apiResponse);
          
          // SuccessResponse 구조에서 데이터 추출
          const userData = apiResponse.data;
          const userInfo = {
            name: userData.name,
            email: userData.email
          };
          
          console.log("추출된 사용자 정보:", userInfo);
          setUserInfo(userInfo);
          await storeUserInfo(userInfo);
          console.log("사용자 정보 저장 완료:", userInfo);
        } else {
          console.error("API 호출 실패:", response.status);
        }
      }
    } catch (error) {
      console.error("사용자 정보 API 조회 실패:", error);
    }
  };

  useEffect(() => {
    loadUserInfo();
    
    // 추가: 컴포넌트 마운트 시 사용자 정보가 없으면 API에서 가져오기
    const ensureUserInfo = async () => {
      const info = await getUserInfo();
      if (!info) {
        console.log("사용자 정보가 없어서 API에서 가져옵니다");
        await refreshUserInfoFromToken();
      }
    };
    
    // 약간의 지연 후 재확인
    setTimeout(ensureUserInfo, 1000);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserInfo();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/(tabs)" as any);
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }
  };

  const menuItems = [
    {
      id: 1,
      title: "공지사항",
      imageSource: require('@/assets/images/notice.png'),
      onPress: () => alert('[공지사항]\n서비스 준비 중입니다.')
    },
    {
      id: 2,
      title: "이벤트",
      imageSource: require('@/assets/images/event.png'),
      onPress: () => alert('[이벤트]\n서비스 준비 중입니다.')
    },
    {
      id: 3,
      title: "출석체크",
      imageSource: require('@/assets/images/attempt.png'),
      onPress: () => alert('[출석체크]\n서비스 준비 중입니다.')
    },
    {
      id: 4,
      title: "수능•모의고사",
      imageSource: require('@/assets/images/test.png'),
      onPress: () => alert('[수능•모의고사]\n서비스 준비 중입니다.')
    },
    {
      id: 5,
      title: "오답노트",
      imageSource: require('@/assets/images/incorrect_note.png'),
      onPress: () => router.push("/incorrect-notes")
    }
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 헤더 */}
      <View style={styles.header}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>
            {(() => {
              console.log("헤더 렌더링 시 userInfo:", userInfo);
              console.log("userInfo?.name 값:", userInfo?.name);
              return userInfo?.name || "사용자";
            })()}님의 책장
        </Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

             <ScrollView 
         style={styles.content}
         refreshControl={
           <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
         }
       >
         {/* 추천 도서 섹션 */}
         <View style={styles.bookSection}>
           <View style={styles.bookCard}>
             <Image
               source={require('@/assets/images/math_book.png')}
               style={styles.bookImage}
               resizeMode="cover"
             />
             <Text style={[styles.bookTitle]}>
               유형체크 N제 중학 수학 1-1
             </Text>
             <TouchableOpacity 
               style={styles.selectButton}
               onPress={() => router.push("/problem" as any)}
             >
               <Text style={styles.selectButtonText}>책 선택하기</Text>
             </TouchableOpacity>
           </View>
         </View>

                   {/* 메뉴 아이템들 */}
          <View style={styles.menuGrid}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={item.onPress}
              >
                <Image 
                  source={item.imageSource} 
                  style={styles.menuIconImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* 천재교육 배너 */}
          <View style={styles.bannerContainer}>
            <Image
              source={require('@/assets/images/chunjae_slo.png')}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </View>

        {/* 배경 이미지 영역 */}
        <View style={styles.backgroundImageContainer}>
          <Image
            source={{ uri: 'https://via.placeholder.com/834x209/E8F4FD/4A90E2?text=Study+Background' }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>
      </ScrollView>

      {/* 하단 탭 */}
      <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.tab} onPress={() => {}}>
          <Image source={require('@/assets/images/library.png')} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: "#000000" }]}>내 서재</Text>
          <View style={styles.activeIndicator} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.tab} onPress={() => {}}>
          <Image source={require('@/assets/images/doucument.png')} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: "#878787" }]}>내 pdf</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.tab} onPress={() => {}}>
          <Image source={require('@/assets/images/storefront.png')} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: "#878787" }]}>서점</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.tab} onPress={() => {}}>
          <Image source={require('@/assets/images/person.png')} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: "#878787" }]}>마이</Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: -0.23,
  },
  logoutButton: {
    padding: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  menuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingVertical: 20,
    gap: 16,
  },
  menuItem: {
    width: "18%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  menuIcon: {
    fontSize: 24,
  },
  menuIconImage: {
    height: 130,
  },
  menuTitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 18,
  },
  bookSection: {
    paddingVertical: 20,
    alignItems: "center",
    width: "100%",
  },
  bookCard: {
    flexDirection: "column",
    padding: 30,
    borderRadius: 30,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    width: "100%",
    backgroundColor: "#F5F5F5",
  },
  bookImage: {
    width: 205,
    height: 280,
    borderRadius: 8,
  },
  bookInfo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bookTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 13,
    lineHeight: 24,
  },
  selectButton: {
    backgroundColor: "#398cf0",
    width: 400,
    height: 55,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  selectButtonText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "500",
  },
  backgroundImageContainer: {
    marginVertical: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  backgroundImage: {
    width: "100%",
    height: 150,
  },
  bannerContainer: {
    marginVertical: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
  },
  tabContainer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 5,
    paddingBottom: 5,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    position: "relative",
  },
  tabText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "500",
  },
  tabIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  activeIndicator: {
    position: "absolute",
    bottom: -8,
    width: 32,
    height: 3,
    backgroundColor: "#000000",
    borderRadius: 2,
  },
});
