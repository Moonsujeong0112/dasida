import { StyleSheet, ScrollView, TouchableOpacity, TextInput, View, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getUserInfo, getAccessToken, storeUserInfo } from '@/src/auth';

// JWT 토큰에서 사용자 ID를 추출하는 유틸리티 함수
const extractUserIdFromToken = async (): Promise<number | null> => {
  try {
    const token = await getAccessToken();
    if (!token) {
      console.warn('액세스 토큰이 없습니다');
      return null;
    }

    console.log('토큰 획득됨:', token.substring(0, 50) + '...');
    
    // JWT 토큰 디코딩
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.warn('유효하지 않은 JWT 토큰 형식');
      return null;
    }

    const payload = tokenParts[1];
    // Base64 디코딩 (패딩 추가)
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const tokenData = JSON.parse(decodedPayload);
    
    console.log('JWT 토큰 페이로드:', tokenData);
    
    // 사용자 ID 추출 (sub 필드 또는 user_id 필드)
    if (tokenData.sub) {
      const userId = parseInt(tokenData.sub);
      console.log('사용자 ID 추출됨 (sub):', userId);
      return userId;
    } else if (tokenData.user_id) {
      const userId = parseInt(tokenData.user_id);
      console.log('사용자 ID 추출됨 (user_id):', userId);
      return userId;
    } else {
      console.warn('JWT 토큰에서 사용자 ID를 찾을 수 없습니다. 사용 가능한 필드:', Object.keys(tokenData));
      return null;
    }
  } catch (error) {
    console.error('사용자 ID 추출 오류:', error);
    return null;
  }
};

interface UserInfo {
  name: string;
  email: string;
}

interface ChatProblem {
  id: string;
  conversationId: string;
  problemText: string;
  source: string;
  problemNumber?: string;
  problemType?: string;
  headerTag?: string;
  imageUrl?: string;
  createdAt: string;
  solutionType: 'step' | 'direct'; // 'step': 단계별 풀이, 'direct': 풀이 바로보기
}

export default function ChatSaveScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [selectedSort, setSelectedSort] = useState('최근저장순');
  const [searchText, setSearchText] = useState('');
  const [archivedProblems, setArchivedProblems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [problemImages, setProblemImages] = useState<{[key: string]: string}>({});

  // 문제 이미지 로드 함수 (incorrect-notes.tsx와 동일)
  const loadProblemImage = async (problemId: string, imageUrl?: string) => {
    try {
      // 이미지 URL이 있으면 사용, 없으면 기본 이미지 사용
      const urls = [
        imageUrl, // DB에서 가져온 이미지 URL
        `http://52.79.233.106:80/uploads/problem_img/checkN_${problemId}.png`, // Nginx 경로
        `http://52.79.233.106:80/uploads/problem_img/checkN_${problemId}.jpg` // JPG 확장자도 시도
      ].filter((url): url is string => Boolean(url)); // null/undefined 제거하고 타입 보장
      
      let lastError = null;
      
      for (const url of urls) {
        try {
          // 상대 경로인 경우 절대 URL로 변환
          let absoluteUrl = url;
          if (url && !url.startsWith('http')) {
            absoluteUrl = `http://52.79.233.106:80/uploads/${url}`;
          }
          
          console.log('🔄 문제 이미지 URL 시도 중:', absoluteUrl);
          const response = await fetch(absoluteUrl, { method: 'HEAD' });
          // console.log('📡 응답 상태:', response.status, response.statusText);
          
          if (response.ok) {
            // console.log('✅ 문제 이미지 URL 성공:', absoluteUrl);
            setProblemImages(prev => ({
              ...prev,
              [problemId]: absoluteUrl
            }));
            return;
          } else {
            console.log('❌ HTTP 에러:', response.status, response.statusText);
            lastError = `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (error) {
          console.log('❌ 네트워크 에러:', url, error);
          lastError = (error as Error).message || 'Unknown error';
        }
      }
      
      // 모든 URL이 실패한 경우 기본 이미지 사용
      console.log('💥 모든 URL 시도 실패. 기본 이미지 사용');
      setProblemImages(prev => ({
        ...prev,
        [problemId]: 'https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image'
      }));
      
    } catch (err) {
      console.error("🔥 문제 이미지 로드 실패:", err);
      // 에러 시에도 기본 이미지 사용
      setProblemImages(prev => ({
        ...prev,
        [problemId]: 'https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image'
      }));
    }
  };

  // 사용자 정보 로드 함수 (incorrect-notes.tsx와 동일)
  const loadUserInfo = async () => {
    try {
      console.log("=== 사용자 정보 로딩 시작 ===");
      const info = await getUserInfo();
      console.log("getUserInfo() 결과:", info);
      // console.log("info의 타입:", typeof info);
      // console.log("info가 null인가?", info === null);
      // console.log("info가 undefined인가?", info === undefined);
      
      if (info) {
        // console.log("사용자 정보 존재, 상태 업데이트 중...");
        // console.log("info.name:", info.name);
        // console.log("info.email:", info.email);
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
          // console.log("API에서 받은 응답:", apiResponse);
          
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

  // 보관된 문제들 로드 함수 (incorrect-notes.tsx와 동일한 방식)
  const loadArchivedProblems = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) {
        console.error("토큰이 없습니다");
        return;
      }

      // JWT 토큰에서 사용자 ID 추출
      const userId = await extractUserIdFromToken();
      if (!userId) {
        console.error("사용자 ID를 추출할 수 없습니다");
        return;
      }
      
      console.log("사용자 ID로 보관된 문제 조회:", userId);
      
      // 보관된 문제들을 가져오는 API 호출 (archived=true 파라미터 추가)
      const response = await fetch(`http://52.79.233.106/fastapi/user/${userId}/conversations?limit=20&archived=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // console.log("보관된 문제 데이터:", data);
        const problems = data.conversations || [];
        setArchivedProblems(problems);
        
        // 각 문제의 이미지 로드 (num_in_page를 4자리 패딩으로 사용)
        problems.forEach((problem: any) => {
          // problem.num_in_page를 사용하여 문제번호 생성 (4자리 형식)
          const problemNumber = problem.num_in_page;
          const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id || `problem_${Date.now()}`;
          const imageUrl = problem.image_url; // DB에서 가져온 이미지 URL
          console.log(`보관된 문제 ${problemNumber} -> 이미지 ID: ${problemId}`);
          loadProblemImage(problemId, imageUrl);
        });
      } else {
        console.error("보관된 문제 조회 실패:", response.status);
        const errorText = await response.text();
        console.error("에러 응답:", errorText);
      }
    } catch (error) {
      console.error("보관된 문제 로딩 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  // 문제 카드 클릭 핸들러 (incorrect-notes.tsx와 동일)
  const handleProblemCardPress = (conversationId: string) => {
    // 문제 카드 클릭 시 채팅 내역 페이지로 이동
    console.log('문제 카드 클릭:', conversationId);
    router.push({
      pathname: '/chatlog-page',
      params: { 
        conversationId: conversationId,
        problemId: conversationId 
      }
    });
  };

  // 필터링된 문제들
  const filteredProblems = archivedProblems.filter(problem => {
    // 검색어 필터링
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const matchesSearch = 
        (problem.p_name && problem.p_name.toLowerCase().includes(searchLower)) ||
        (problem.source && problem.source.toLowerCase().includes(searchLower)) ||
        (problem.headerTag && problem.headerTag.toLowerCase().includes(searchLower));
      
      if (!matchesSearch) return false;
    }

    // 필터 타입별 필터링 (solution_type이 있는 경우)
    if (selectedFilter === '단계별 풀이' && problem.solution_type !== 'step') return false;
    if (selectedFilter === '풀이 바로보기' && problem.solution_type !== 'direct') return false;

    return true;
  });

  // 정렬
  const sortedProblems = [...filteredProblems].sort((a, b) => {
    if (selectedSort === '최근저장순') {
      return new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime();
    } else {
      return new Date(a.created_at || a.timestamp || 0).getTime() - new Date(b.created_at || b.timestamp || 0).getTime();
    }
  });

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

  useEffect(() => {
    // 사용자 정보가 로드된 후 보관된 문제 로드
    if (userInfo) {
      loadArchivedProblems();
    }
  }, [userInfo]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 상단 네비게이션 */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Image 
            source={require('@/assets/images/back_page.png')} 
            style={styles.headerIcon} 
          />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>질문 내역 전체보기</ThemedText>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => alert('[미지원 서비스 - 이후저장기능]\n서비스 개발 진행 중입니다.')}
          >
            <Image 
              source={require('@/assets/images/save.png')} 
              style={styles.addButtonImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* 질문내역 정렬 선택 */}
      <View style={styles.filterSection}>
        <View style={styles.filterButtons}>
          {['전체', '단계별 풀이', '풀이 바로보기'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton,
                selectedFilter === filter && { 
                  backgroundColor: '#3861DA',
                  shadowColor: '#000',
                  shadowOffset: {
                    width: 0,
                    height: 4,
                  },
                  shadowOpacity: 0.25,
                  shadowRadius: 10,
                  elevation: 5,
                }
              ]}
              onPress={() => {
                if (filter === '전체') {
                  setSelectedFilter(filter);
                } else {
                  alert('[미지원 서비스]\n\n서비스 개발 진행 중입니다.');
                }
              }}
            >
              <ThemedText 
                style={[
                  styles.filterButtonText,
                  selectedFilter === filter && { color: '#FFFFFF' }
                ]}
              >
                {filter}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.sortSection}>
          {['최근저장순', '오래된순'].map((sort) => (
            <TouchableOpacity
              key={sort}
              style={styles.sortButton}
              onPress={() => setSelectedSort(sort)}
            >
              <ThemedText style={styles.sortButtonText}>{sort}</ThemedText>
              <View style={[
                styles.radioButton,
                selectedSort === sort && { backgroundColor: '#3861DA' }
              ]}>
                {selectedSort === sort && (
                  <View style={styles.radioButtonInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 검색바 */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={21} color="#BEBEBE" />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="문제집명, 단원, 유형 등을 입력하세요"
            placeholderTextColor="#BEBEBE"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* 문제 카드 목록 */}
      <ScrollView style={styles.problemList} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ThemedText>로딩 중...</ThemedText>
          </View>
        ) : sortedProblems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="archivebox" size={48} color="#ccc" />
            <ThemedText style={styles.emptyText}>보관된 문제가 없습니다</ThemedText>
          </View>
        ) : (
          <View style={styles.unitSection}>
            {/* <View style={styles.unitHeader}>
              <ThemedText style={styles.unitTitle}>질문내역 전체보기</ThemedText>
              <ThemedText style={styles.problemCount}>{sortedProblems.length}개</ThemedText>
            </View> */}
            
            <View style={styles.problemsGrid}>
              {sortedProblems.map((problem, index) => (
                <TouchableOpacity
                  key={problem.conversation_id}
                  style={styles.problemCard}
                  onPress={() => handleProblemCardPress(problem.conversation_id)}
                >
                  {/* 이미지 영역 */}
                  <View style={styles.problemImageContainer}>
                    {(() => {
                      // problem.num_in_page를 사용하여 문제번호 생성 (4자리 형식)
                      const problemNumber = problem.num_in_page;
                      const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id || `problem_${Date.now()}`;
                      
                      return problemImages[problemId] ? (
                        <Image
                          source={{ uri: problemImages[problemId] }}
                          style={styles.problemImage}
                          resizeMode="contain"
                          onError={() => {
                            console.error("문제 이미지 로드 실패:", problemId);
                            // 에러 시 기본 이미지로 설정
                            setProblemImages(prev => ({
                              ...prev,
                              [problemId]: 'https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image'
                            }));
                          }}
                        />
                      ) : (
                        <View style={styles.imagePlaceholder}>
                          <IconSymbol name="doc.text" size={32} color="#E5E5E5" />
                          <ThemedText style={styles.placeholderText}>이미지 로딩 중...</ThemedText>
                        </View>
                      );
                    })()}
                  </View>
                  
                  {/* 하단 정보 영역 */}
                  <View style={styles.problemFooter}>
                    <View style={styles.problemInfo}>
                      <ThemedText style={styles.problemBookName}>
                        {problem.p_name || `문제 ${index + 1}`} {problem.p_page && problem.num_in_page 
                          ? `p.${problem.p_page} ${problem.num_in_page}번`
                          : '페이지 정보 없음'
                        }
                      </ThemedText>
                    </View>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleProblemCardPress(problem.conversation_id)}
                    >
                      <ThemedText style={styles.actionButtonText}>
                        {problem.solution_type === 'direct' ? '풀이 바로보기' : '단계별 풀이'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
              
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    padding: 8,
  },
  addButtonImage: {
    width: 40,
    height: 40,
  },
  headerIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  filterSection: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 16,
    height: 60,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 15,
    height: 60,
  },
  filterButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 120,
    height: 46,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  filterButtonText: {
    fontFamily: 'Pretendard',
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
    color: '#000000',
  },
  sortSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    height: 60,
    paddingVertical: 8,
  },
  sortButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    height: 40,
    borderRadius: 100,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#3861DA',
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  sortButtonText: {
    fontFamily: 'Pretendard',
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: -0.43,
    color: '#000000',
  },
  searchSection: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    marginTop: 0,
  },
  searchBar: {
    width: '100%',
    maxWidth: 794,
    height: 44,
    backgroundColor: 'rgba(120, 120, 128, 0.16)',
    borderRadius: 100,
    paddingHorizontal: 11,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    color: '#BEBEBE',
    fontWeight: '400',
    marginLeft: 8,
  },
  problemList: {
    flex: 1,
  },
  unitSection: {
    marginBottom: 16,
  },
  unitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  unitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  problemCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  problemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  problemCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    position: 'relative',
    minHeight: 200,
  },
  problemImageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    height: 150,
    overflow: 'hidden',
  },
  problemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  problemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 15,
    width: 350,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 15,
    alignSelf: 'center',
  },
  problemInfo: {
    flex: 1,
  },
  problemBookName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3861DA',
    marginBottom: 4,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#3861DA',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyCard: {
    width: '48%',
    height: 200,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderStyle: 'dashed',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});
