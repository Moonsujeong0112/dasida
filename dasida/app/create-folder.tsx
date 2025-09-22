import { StyleSheet, ScrollView, TouchableOpacity, TextInput, View, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getAccessToken } from '@/src/auth';

interface ProblemCard {
  id: string;
  number: string;
  text: string;
  bookName: string;
  page: string;
  isSelected: boolean;
  isFavorite: boolean;
  hasImage?: boolean;
  problemType?: string;
  conversation_id: string;
  p_name?: string;
  p_page?: string;
  num_in_page?: string;
  image_url?: string;
}

export default function CreateFolderScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors.light;
  const params = useLocalSearchParams();
  const folderName = params.folderName as string;
  const classification = params.classification as string;
  
  const [selectedCategory, setSelectedCategory] = useState('문제집별');
  const [searchText, setSearchText] = useState('');
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(new Set());
  const [problems, setProblems] = useState<ProblemCard[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [problemImages, setProblemImages] = useState<{[key: string]: string}>({});
  const [bookmarkedProblems, setBookmarkedProblems] = useState(new Set());
  const [filteredProblems, setFilteredProblems] = useState<ProblemCard[]>([]);

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

  // 문제 이미지 로드 함수
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
          console.log('🔄 문제 이미지 URL 시도 중:', url);
          const response = await fetch(url, { method: 'HEAD' });
          console.log('📡 응답 상태:', response.status, response.statusText);
          
          if (response.ok) {
            console.log('✅ 문제 이미지 URL 성공:', url);
            setProblemImages(prev => ({
              ...prev,
              [problemId]: url
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

  // 실제 DB에서 문제 데이터 로드
  const loadProblems = async () => {
    try {
      setLoadingProblems(true);
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
      
      console.log("사용자 ID로 문제 조회:", userId);
      
      const response = await fetch(`http://52.79.233.106/fastapi/user/${userId}/conversations?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log("문제 데이터:", data);
        const rawProblems = data.conversations || [];
        
        // DB 데이터를 ProblemCard 형식으로 변환 (오답 리포트가 있는 문제만 필터링)
        const formattedProblems: ProblemCard[] = rawProblems
          .filter((problem: any) => {
            // 오답 리포트가 있는 문제만 필터링
            const hasReport = problem.full_report_content && problem.full_report_content.trim().length > 0;
            console.log('🔍 오답 리포트 확인:', {
              problemId: problem.conversation_id,
              hasReport,
              reportLength: problem.full_report_content ? problem.full_report_content.length : 0
            });
            return hasReport;
          })
          .map((problem: any) => {
            const problemNumber = problem.num_in_page;
            const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id;
            
            return {
              id: problem.conversation_id,
              number: problemNumber || '0000',
              text: problem.p_text || '문제 내용을 불러올 수 없습니다.',
              bookName: problem.p_name || '유형체크N제',
              page: problem.p_page ? `p.${problem.p_page} ${problem.num_in_page}번` : '페이지 정보 없음',
              isSelected: false,
              isFavorite: false,
              hasImage: !!problem.p_img_url,
              problemType: problem.p_type || '주관식',
              conversation_id: problem.conversation_id,
              p_name: problem.p_name,
              p_page: problem.p_page,
              num_in_page: problem.num_in_page,
              image_url: problem.p_img_url
            };
          });
        
        setProblems(formattedProblems);
        
        // 각 문제의 이미지 로드
        formattedProblems.forEach((problem) => {
          const problemId = problem.num_in_page ? String(problem.num_in_page).padStart(4, '0') : problem.conversation_id;
          loadProblemImage(problemId, problem.image_url);
        });
      } else {
        console.error("문제 조회 실패:", response.status);
        const errorText = await response.text();
        console.error("에러 응답:", errorText);
      }
    } catch (error) {
      console.error("문제 로딩 오류:", error);
    } finally {
      setLoadingProblems(false);
    }
  };

  useEffect(() => {
    loadProblems();
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleClear = () => {
    setSelectedProblems(new Set());
  };

  const handleProblemSelect = (problemId: string) => {
    console.log('문제 선택/해제:', problemId);
    setSelectedProblems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(problemId)) {
        newSet.delete(problemId);
        console.log('문제 해제됨:', problemId);
      } else {
        newSet.add(problemId);
        console.log('문제 선택됨:', problemId);
      }
      return newSet;
    });
  };

  const handleFavorite = (problemId: string) => {
    console.log('즐겨찾기 토글:', problemId);
    setProblems(prev => 
      prev.map(problem => 
        problem.id === problemId 
          ? { ...problem, isFavorite: !problem.isFavorite }
          : problem
      )
    );
  };

  const toggleBookmark = (problemId: string) => {
    setBookmarkedProblems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(problemId)) {
        newSet.delete(problemId);
      } else {
        newSet.add(problemId);
      }
      return newSet;
    });
  };

  const handleCreateFolder = () => {
    // 선택된 문제들과 함께 폴더 생성
    console.log('폴더 생성:', {
      folderName,
      classification,
      selectedProblems: Array.from(selectedProblems)
    });
    
    // 선택된 문제들의 conversation_id 추출
    const selectedProblemIds = Array.from(selectedProblems);
    
    // 폴더 생성 완료 후 incorrect-notes로 돌아가면서 데이터 전달
    router.push({
      pathname: '/incorrect-notes',
      params: {
        newFolder: JSON.stringify({
          name: folderName,
          classification: classification,
          problemIds: selectedProblemIds
        })
      }
    });
  };

  // 문제 필터링 함수
  const applyFilters = (problemsList: ProblemCard[]) => {
    let filtered = problemsList;

    // 검색 필터링
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(problem => {
        return problem.text.toLowerCase().includes(searchLower) ||
               problem.bookName.toLowerCase().includes(searchLower) ||
               problem.number.toLowerCase().includes(searchLower) ||
               problem.conversation_id.toLowerCase().includes(searchLower);
      });
    }

    // 카테고리별 필터링
    switch (selectedCategory) {
      case '날짜별':
        // 최근순 정렬
        filtered.sort((a, b) => {
          // conversation_id를 기반으로 날짜 추정 (실제로는 started_at 필드가 필요)
          return b.conversation_id.localeCompare(a.conversation_id);
        });
        break;
      case '즐겨찾기':
        // 즐겨찾기된 문제만 필터링
        filtered = filtered.filter(problem => bookmarkedProblems.has(problem.conversation_id));
        break;
      case '단원별':
        // 단원별로 그룹핑 (현재는 단순 정렬)
        filtered.sort((a, b) => a.bookName.localeCompare(b.bookName));
        break;
      case '문제집별':
        // 문제집별로 정렬
        filtered.sort((a, b) => a.bookName.localeCompare(b.bookName));
        break;
    }

    return filtered;
  };

  // 필터링된 문제 목록 계산
  const getFilteredProblems = () => {
    return applyFilters(problems);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Main Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image 
            source={require('@/assets/images/back_page.png')} 
            style={styles.headerIcon} 
          />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>문제 선택</ThemedText>
        <ThemedView style={styles.headerActions}>
          <TouchableOpacity style={styles.createFolderHeaderButton} onPress={handleCreateFolder}>
            <Image 
            source={require('@/assets/images/uploads.png')} 
            style={styles.headerIcon} 
            />
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* Selection Status Banner */}
      {selectedProblems.size > 0 && (
        <ThemedView style={styles.selectionBanner}>
          <ThemedText style={styles.selectionText}>
            {selectedProblems.size}개의 문제 선택됨
          </ThemedText>
          <View style={styles.bannerRightActions}>
            <TouchableOpacity style={styles.bannerActionButton} onPress={handleClear}>
              <Image 
                source={require('@/assets/images/white_loading.png')} 
                style={styles.headerIcon} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bannerActionButton} onPress={handleBack}>
              <Image 
                source={require('@/assets/images/white_close.png')} 
                style={styles.headerIcon} 
              />
            </TouchableOpacity>
          </View>
        </ThemedView>
      )}

      {/* Search Bar */}
      <ThemedView style={styles.searchSection}>
        <ThemedView style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={20} color="#666" />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="문제집명, 단원, 유형 등을 입력하세요"
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={setSearchText}
          />
        </ThemedView>
      </ThemedView>

      {/* Category Tabs Container */}
      <ThemedView style={styles.categoryContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryTabs}
          bounces={true}
          decelerationRate="normal"
          scrollEventThrottle={16}
          nestedScrollEnabled={true}
        >
          {['날짜별', '즐겨찾기', '단원별', '문제집별'].map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryTab,
                selectedCategory === category && styles.activeCategoryTab
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <ThemedText style={[
                styles.categoryTabText,
                selectedCategory === category && styles.activeCategoryTabText
              ]}>
                {category}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {/* Fixed Add Button */}
        <TouchableOpacity style={styles.addButton}>
            <Image 
              source={require('@/assets/images/plus_folder.png')} 
              style={styles.addButtonImage} 
            />
        </TouchableOpacity>
      </ThemedView>

      {/* Problem List */}
      <ScrollView style={styles.problemList} showsVerticalScrollIndicator={false}>
        {loadingProblems ? (
          <ThemedView style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>문제를 불러오는 중...</ThemedText>
          </ThemedView>
        ) : problems.length > 0 ? (
          <ThemedView style={styles.problemSetSection}>
            <ThemedView style={styles.problemSetHeader}>
              <ThemedText style={styles.problemSetTitle}>문제 목록</ThemedText>
              <ThemedText style={styles.problemCount}>{getFilteredProblems().length}개</ThemedText>
            </ThemedView>
            
            <ThemedView style={styles.problemsGrid}>
              {getFilteredProblems().map((problem, index) => (
                <TouchableOpacity 
                  key={`create-folder-${problem.id}-${index}`} 
                  style={[
                    styles.problemCard,
                    selectedProblems.has(problem.id) && styles.selectedProblemCard,
                    !selectedProblems.has(problem.id) && styles.disabledProblemCard
                  ]}
                  onPress={() => handleProblemSelect(problem.id)}
                  activeOpacity={0.7}
                >
                  {/* Disabled Overlay - only for unselected cards */}
                  {!selectedProblems.has(problem.id) && (
                    <ThemedView style={styles.disabledOverlay} pointerEvents="none" />
                  )}
                  
                  <ThemedView style={styles.problemContent}>
                    {/* Selection Checkmark - only for selected cards */}
                    {selectedProblems.has(problem.id) && (
                      <ThemedView style={styles.selectionCheckmark}>
                        <Image 
                          source={require('@/assets/images/selected.png')} 
                          style={styles.checkIcon} 
                        />
                      </ThemedView>
                    )}
                    
                    
                    {/* Problem Image */}
                    <ThemedView style={styles.problemImageContainer}>
                      {(() => {
                        const problemNumber = problem.num_in_page;
                        const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id;
                        
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
                          <ThemedView style={styles.imagePlaceholder}>
                            <IconSymbol name="doc.text" size={32} color="#E5E5E5" />
                            <ThemedText style={styles.placeholderText}>이미지 로딩 중...</ThemedText>
                          </ThemedView>
                        );
                      })()}
                    </ThemedView>
                    
                    {/* 하단 정보 영역 */}
                    <ThemedView style={styles.problemFooter}>
                      <ThemedView style={styles.problemInfo}>
                        <ThemedText style={styles.problemBookName}>
                          {problem.bookName} {problem.page}
                        </ThemedText>
                      </ThemedView>
                      {/* Favorite Button */}
                      <TouchableOpacity 
                        style={styles.bookmarkButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleBookmark(problem.conversation_id);
                        }}
                      >
                        <Image 
                          source={bookmarkedProblems.has(problem.conversation_id) 
                            ? require('@/assets/images/star-fill.png') 
                            : require('@/assets/images/start.png')
                          } 
                          style={styles.bookmarkIcon} 
                        />
                      </TouchableOpacity>
                    </ThemedView>
                  </ThemedView>
                </TouchableOpacity>
              ))}
            </ThemedView>
          </ThemedView>
        ) : (
          <ThemedView style={styles.emptyStateContainer}>
            <ThemedText style={styles.emptyStateText}>문제가 없습니다.</ThemedText>
            <ThemedText style={styles.emptyStateSubText}>채팅한 문제가 여기에 표시됩니다.</ThemedText>
          </ThemedView>
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
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  statusTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBattery: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000',
  },
  batteryIcon: {
    width: 26.5,
    height: 12,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 3.25,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  bookmarkButton: {
    padding: 4,
  },
  bookmarkIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    textAlign: 'left',
    flex: 1,
    marginLeft: 16,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 48,
    height: 48,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createFolderHeaderButton: {
    width: 38,
    height: 38,
    borderRadius: 24,
    backgroundColor: '#3861DA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  checkIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  selectionBanner: {
    backgroundColor: '#3861DA',
    height: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'left',
    marginLeft: 15,
    flex: 1,
  },
  bannerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  bannerActionButton: {
    padding: 8,
    backgroundColor: 'transparent',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  categoryContainer: {
    position: 'relative',
    marginHorizontal: -16,
  },
  categoryScroll: {
    marginHorizontal: -16,
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: '100%',
  },
  categoryTab: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 182,
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    flexShrink: 0,
    marginRight: 10,
  },
  activeCategoryTab: {
    backgroundColor: '#3861DA',
    paddingHorizontal: 45,
    minWidth: 200,
  },
  categoryTabText: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '400',
    textAlign: 'center',
    color: '#000000',
    flexShrink: 1,
  },
  activeCategoryTabText: {
    color: '#FFFFFF',
  },
  addButton: {
    position: 'absolute',
    width: 60,
    height: 60,
    right: 15,
    top: -12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    gap: 10,
    zIndex: 10,
  },
  addButtonIcon: {
    width: 38,
    height: 38,
    borderRadius: 24,
    backgroundColor: '#3861DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  problemList: {
    flex: 1,
  },
  problemSetSection: {
    marginBottom: 16,
  },
  problemSetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  problemSetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  expandButton: {
    padding: 8,
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
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    position: 'relative',
    minHeight: 200,
  },
  problemContent: {
    position: 'relative',
  },

  selectionCheckmark: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3861DA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  problemTypeTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  problemTypeText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
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
  favoriteButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    padding: 8,
    zIndex: 10,
  },
  // Additional Styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  problemCount: {
    fontSize: 14,
    color: '#666',
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
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  // Image Styles
  problemImageContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    height: 140,
    overflow: 'hidden',
  },
  addButtonImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  problemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
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
  // Disabled Styles
  disabledProblemCard: {
    position: 'relative',
  },
  disabledProblemImage: {
    opacity: 1,
  },
  disabledProblemInfo: {
    opacity: 1,
    color: '#3861DA',
  },
  disabledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    zIndex: 5,
  },
  // Selected card styles
  selectedProblemCard: {
    borderColor: '#3861DA',
    borderWidth: 2,
  },
});
