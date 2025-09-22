import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Image, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

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

// 메타데이터를 제거하는 유틸리티 함수
const removeMetadataFromMessage = (message: string): string => {
  // HTML 주석 형태의 메타데이터 제거: <!-- {"current_step":...} --> 또는 <!--, "max_attempts_per_step":3} -->
  const htmlCommentRegex = /<!--\s*[^>]*-->/g;
  
  // JSON 형태의 메타데이터 제거: {"current_step":2, "attempts":{"2":1}, "steps_total":4}
  const jsonMetadataRegex = /\{\s*"current_step"[^}]*\}/g;
  
  // 두 패턴 모두 제거
  let cleanedMessage = message.replace(htmlCommentRegex, '');
  cleanedMessage = cleanedMessage.replace(jsonMetadataRegex, '');
  
  // 앞뒤 공백 제거
  return cleanedMessage.trim();
};

interface UserInfo {
  name: string;
  email: string;
}

export default function IncorrectNotesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors.light;
  const params = useLocalSearchParams();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('날짜별');
  const [searchText, setSearchText] = useState('');
  const [expandedUnits, setExpandedUnits] = useState(['1-1-4']);
  const [selectedGrade, setSelectedGrade] = useState('중학1학년');
  const [selectedSemester, setSelectedSemester] = useState('1학기');
  const [selectedSubject, setSelectedSubject] = useState('수학');
  const [showGradeDropdown, setShowGradeDropdown] = useState(false);
  const [showSemesterDropdown, setShowSemesterDropdown] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [bookmarkedProblems, setBookmarkedProblems] = useState(new Set());
  const [hoveredDropdownItem, setHoveredDropdownItem] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('1개월');
  const [selectedDifficulty, setSelectedDifficulty] = useState('전체');
  const [selectedProblemTypes, setSelectedProblemTypes] = useState<string[]>([]);
  const [selectedErrorPatterns, setSelectedErrorPatterns] = useState<string[]>([]);
  const [selectedErrorCauses, setSelectedErrorCauses] = useState(['개념 오해', '문항 해석 실수']);
  const [chatProblems, setChatProblems] = useState<any[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [problemImages, setProblemImages] = useState<{[key: string]: string}>({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [selectedClassification, setSelectedClassification] = useState('날짜별');
  const [expandedMainChapters, setExpandedMainChapters] = useState(['중1-1']);
  const [expandedSubChapters, setExpandedSubChapters] = useState(['2-2']);
  const [userFolders, setUserFolders] = useState<Array<{
    id: string;
    name: string;
    classification: string;
    problemIds: string[];
  }>>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [imageDimensions, setImageDimensions] = useState<{[key: string]: {width: number, height: number}}>({});

  // 오답 패턴 옵션
  const errorPatternOptions = [
    '문항 해석 실수',
    '개념 오해', 
    '전략 선택 오류',
    '계산 실수',
    '표현 실수',
    '절차 수행 오류'
  ];

  // 이미지 크기 계산 함수
  const calculateImageSize = (imageUrl: string, containerWidth: number, maxHeight: number) => {
    return new Promise<{width: number, height: number}>((resolve) => {
      Image.getSize(imageUrl, (imgWidth, imgHeight) => {
        const widthScale = containerWidth / imgWidth;
        const scaledWidth = widthScale * imgWidth;
        const scaledHeight = widthScale * imgHeight;
        
        // 높이가 최대 높이를 넘지 않으면 원본 비율 그대로 사용
        if (scaledHeight <= maxHeight) {
          resolve({
            width: scaledWidth,
            height: scaledHeight
          });
        } else {
          // 높이가 최대 높이를 넘으면 잘리도록 설정
          resolve({
            width: scaledWidth,
            height: maxHeight
          });
        }
      }, (error) => {
        console.error('이미지 크기 계산 실패:', error);
        resolve({ width: containerWidth, height: maxHeight });
      });
    });
  };

  const loadProblemImage = async (problemId: string, imageUrl?: string) => {
    try {
      // 이미지 URL이 있으면 사용, 없으면 기본 이미지 사용
      const urls = [
        imageUrl, // DB에서 가져온 이미지 URL
        `http://52.79.233.106:80/uploads/problem_img/checkN_${problemId}.png`, // Nginx 경로
        `http://52.79.233.106:80/uploads/problem_img/checkN_${problemId}.jpg` // JPG 확장자도 시도
        //`http://52.79.233.106:80/uploads/problem_img/checkN_0818.png`, // 기본 이미지
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
            
            // 이미지 크기 계산
            const screenWidth = Dimensions.get('window').width;
            const cardWidth = (screenWidth - 32 - 12) / 2; // 카드 너비 계산 (화면너비 - 패딩 - 간격) / 2
            const maxHeight = 150;
            
            const dimensions = await calculateImageSize(url, cardWidth, maxHeight);
            setImageDimensions(prev => ({
              ...prev,
              [problemId]: dimensions
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
    
    // 폴더 생성 완료 후 전달된 데이터 처리
    if (params.newFolder) {
      try {
        const newFolderData = JSON.parse(params.newFolder as string);
        console.log('새 폴더 데이터 받음:', newFolderData);
        addUserFolder(newFolderData.name, newFolderData.classification, newFolderData.problemIds);
        setSelectedCategory(newFolderData.name); // 새로 생성된 폴더로 자동 선택
      } catch (error) {
        console.error('폴더 데이터 파싱 오류:', error);
      }
    }
  }, [params.newFolder]);

  const loadChatProblems = async () => {
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
      
      console.log("사용자 ID로 채팅 문제 조회:", userId);
      
      const response = await fetch(`http://52.79.233.106/fastapi/user/${userId}/conversations?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log("채팅 문제 데이터:", data);
        const problems = data.conversations || [];
        
        // 각 문제의 날짜 정보 확인
        problems.forEach((problem: any) => {
          console.log(`문제 ${problem.conversation_id} 정보:`, {
            started_at: problem.started_at,
            startedAtDate: problem.started_at ? new Date(problem.started_at).toISOString() : null,
            startedAtLocal: problem.started_at ? new Date(problem.started_at).toLocaleString('ko-KR') : null,
            p_type: problem.p_type,
            mappedType: mapDbTypeToFrontendType(problem.p_type),
            p_name: problem.p_name,
            full_report_content: problem.full_report_content ? '있음' : '없음' // 리포트 내용 확인
          });
        });
        
        // p_type 분포 확인
        const pTypeCounts: {[key: string]: number} = {};
        const mappedTypeCounts: {[key: string]: number} = {};
        problems.forEach((problem: any) => {
          const dbType = problem.p_type || 'unknown';
          const frontendType = mapDbTypeToFrontendType(dbType);
          pTypeCounts[dbType] = (pTypeCounts[dbType] || 0) + 1;
          mappedTypeCounts[frontendType] = (mappedTypeCounts[frontendType] || 0) + 1;
        });
        console.log('🔍 DB p_type 분포:', pTypeCounts);
        console.log('🔍 매핑된 프론트엔드 타입 분포:', mappedTypeCounts);
        
        setChatProblems(problems);
        
        // 각 문제의 이미지 로드
        problems.forEach((problem: any) => {
          // problem.num_in_page를 사용하여 문제번호 생성 (4자리 형식)
          const problemNumber = problem.num_in_page;
          const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id || `problem_${Date.now()}`;
          const imageUrl = problem.image_url; // DB에서 가져온 이미지 URL
          console.log(`문제 ${problemNumber} -> 이미지 ID: ${problemId}`);
          loadProblemImage(problemId, imageUrl);
        });
      } else {
        console.error("채팅 문제 조회 실패:", response.status);
        const errorText = await response.text();
        console.error("에러 응답:", errorText);
      }
    } catch (error) {
      console.error("채팅 문제 로딩 오류:", error);
    } finally {
      setLoadingProblems(false);
    }
  };

  useEffect(() => {
    // 사용자 정보가 로드된 후 채팅 문제 로드
    if (userInfo) {
      loadChatProblems();
    }
  }, [userInfo]);

  // 초기 조회 기간 설정
  useEffect(() => {
    // 컴포넌트 마운트 시 기본 조회 기간(1개월) 설정
    handlePeriodChange('1개월');
  }, []);

  // 필터링된 문제 목록 계산
  const getFilteredProblems = () => {
    console.log('🔍 필터링 시작 - 원본 문제 수:', chatProblems.length);
    // console.log('🔍 현재 필터 설정:', {
    //   selectedGrade,
    //   selectedSemester,
    //   selectedSubject,
    //   selectedCategory,
    //   selectedPeriod,
    //   selectedDifficulty,
    //   selectedProblemTypes,
    //   searchText
    // });
    
    let filtered = [...chatProblems];

    // 0. 오답 리포트가 있는 문제만 필터링 (최우선 필터)
    filtered = filtered.filter(problem => {
      const hasReport = problem.full_report_content && problem.full_report_content.trim().length > 0;
      console.log('🔍 오답 리포트 확인:', {
        problemId: problem.conversation_id,
        hasReport,
        reportLength: problem.full_report_content ? problem.full_report_content.length : 0
      });
      return hasReport;
    });
    
    // console.log('🔍 오답 리포트 필터링 후 문제 수:', filtered.length);

    // 0.5. 사용자 정의 폴더 필터링 (기본 카테고리보다 우선)
    const userFolder = userFolders.find(f => f.name === selectedCategory);
    if (userFolder) {
      console.log('🔍 사용자 폴더 필터링 적용:', {
        folderName: userFolder.name,
        folderClassification: userFolder.classification,
        folderProblemIds: userFolder.problemIds,
        totalProblemsBeforeFilter: filtered.length
      });
      
      // 폴더에 포함된 문제들만 필터링
      filtered = filtered.filter(problem => 
        userFolder.problemIds.includes(problem.conversation_id)
      );
      
      console.log('🔍 사용자 폴더 필터링 후 문제 수:', filtered.length);
    }

    // 1. 학년별 필터링 (현재는 중학1학년만)
    if (selectedGrade !== '중학1학년') {
      // 다른 학년 선택 시 빈 결과 반환
      filtered = [];
    }

    // 2. 학기별 필터링 (현재는 1학기만)
    if (selectedSemester !== '1학기') {
      // 다른 학기 선택 시 빈 결과 반환
      filtered = [];
    }

    // 3. 과목별 필터링 (현재는 수학만)
    if (selectedSubject !== '수학') {
      // 다른 과목 선택 시 빈 결과 반환
      filtered = [];
    }

    // 4. 검색 필터링
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(problem => {
        // 문제집명, 단원, 유형에서 검색
        const textbookName = problem.p_name?.toLowerCase() || '';
        const mainChapter = problem.main_chapt?.toLowerCase() || '';
        const subChapter = problem.sub_chapt?.toLowerCase() || '';
        const contentType = problem.con_type?.toLowerCase() || '';
        const problemType = problem.p_type?.toLowerCase() || '';
        
        console.log('🔍 검색 필터링 확인:', {
          problemId: problem.conversation_id,
          textbookName,
          mainChapter,
          subChapter,
          contentType,
          problemType,
          searchText: searchLower
        });
        
        return textbookName.includes(searchLower) || 
               mainChapter.includes(searchLower) || 
               subChapter.includes(searchLower) || 
               contentType.includes(searchLower) || 
               problemType.includes(searchLower);
      });
    }

    // 5. 필터 모달 필터링 (우선순위 높음)
    // 5-1. 문제 출제 방식 필터링 (가장 높은 우선순위)
    if (selectedProblemTypes.length > 0) {
      console.log('🔍 문제 출제 방식 필터링 적용:', {
        selectedFrontendTypes: selectedProblemTypes,
        selectedDbTypes: selectedProblemTypes.map(mapFrontendTypeToDbType),
        totalProblemsBeforeFilter: filtered.length
      });
      
      filtered = filtered.filter(problem => {
        const dbType = problem.p_type;
        const frontendType = mapDbTypeToFrontendType(dbType);
        const isMatch = selectedProblemTypes.includes(frontendType);
        
        console.log('🔍 문제 출제 방식 확인:', {
          problemId: problem.conversation_id,
          dbType: dbType,
          frontendType: frontendType,
          selectedTypes: selectedProblemTypes,
          isMatch
        });
        
        return isMatch;
      });
      
      console.log('🔍 문제 출제 방식 필터링 후 문제 수:', filtered.length);
    } else {
      console.log('🔍 문제 출제 방식 필터링 건너뜀 (선택된 타입 없음)');
    }

    // 5-2. 조회 기간 필터링
    if (selectedStartDate && selectedEndDate) {
      console.log('🔍 조회 기간 필터링 적용:', {
        period: selectedPeriod,
        startDate: selectedStartDate.toISOString(),
        endDate: selectedEndDate.toISOString(),
        startDateLocal: selectedStartDate.toLocaleDateString('ko-KR'),
        endDateLocal: selectedEndDate.toLocaleDateString('ko-KR')
      });
      
      filtered = filtered.filter(problem => {
        // started_at 컬럼 사용 (대화 시작 시간)
        const problemDate = new Date(problem.started_at);
        
        // 시간을 고려한 정확한 비교
        const startOfDay = new Date(selectedStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(selectedEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const isInRange = problemDate >= startOfDay && problemDate <= endOfDay;
        
        // console.log('🔍 문제 날짜 확인:', {
        //   problemId: problem.conversation_id,
        //   startedAt: problem.started_at,
        //   problemDate: problemDate.toISOString(),
        //   problemDateLocal: problemDate.toLocaleDateString('ko-KR'),
        //   startOfDay: startOfDay.toISOString(),
        //   endOfDay: endOfDay.toISOString(),
        //   isInRange
        // });
        
        return isInRange;
      });
      
      console.log('🔍 조회 기간 필터링 후 문제 수:', filtered.length);
    }

    // 5-3. 오답 패턴 필터링 (가장 높은 우선순위)
    if (selectedErrorPatterns.length > 0) {
      console.log('🔍 오답 패턴 필터링 적용:', {
        selectedPatterns: selectedErrorPatterns,
        totalProblemsBeforeFilter: filtered.length
      });
      
      filtered = filtered.filter(problem => {
        const problemPatterns = problem.error_patterns || [];
        const hasMatchingPattern = selectedErrorPatterns.some(selectedPattern => 
          problemPatterns.includes(selectedPattern)
        );
        
        console.log('🔍 오답 패턴 확인:', {
          problemId: problem.conversation_id,
          problemPatterns,
          selectedPatterns: selectedErrorPatterns,
          hasMatchingPattern
        });
        
        return hasMatchingPattern;
      });
      
      console.log('🔍 오답 패턴 필터링 후 문제 수:', filtered.length);
    } else {
      console.log('🔍 오답 패턴 필터링 건너뜀 (선택된 패턴 없음)');
    }

    // 5-4. 난이도 필터링
    if (selectedDifficulty && selectedDifficulty !== '전체') {
      filtered = filtered.filter(problem => {
        const level = problem.p_level;
        switch (selectedDifficulty) {
          case '상': return level === '상중' || level === '상';
          case '중': return level === '중' || level === '중하';
          case '하': return level === '하';
          default: return true;
        }
      });
    }

    // 6. 분류별 필터링 (우선순위 낮음) - 사용자 폴더가 아닌 경우에만 적용
    if (!userFolder) {
      switch (selectedCategory) {
        case '날짜별':
          // 최근순 정렬 (기본값) - started_at 기준 (대화 시작 시간)
          filtered.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
          break;
        case '즐겨찾기':
          // 즐겨찾기된 문제만 필터링
          filtered = filtered.filter(problem => bookmarkedProblems.has(problem.conversation_id));
          // 최근순 정렬 - started_at 기준 (대화 시작 시간)
          filtered.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
          break;
        case '단원별':
          // 단원별 분류는 별도 UI로 처리하므로 여기서는 필터링하지 않음
          // 단원별 UI에서는 모든 문제를 표시하고 토글식으로 그룹핑
          break;
        case '문제집별':
          // 문제집별로 그룹핑 (현재는 단순 정렬)
          filtered.sort((a, b) => {
            const textbookA = a.p_name || '';
            const textbookB = b.p_name || '';
            return textbookA.localeCompare(textbookB);
          });
          break;
      }
    }

    console.log('🔍 필터링 완료 - 결과 문제 수:', filtered.length);
    return filtered;
  };

  // DB p_type을 프론트엔드 버튼으로 매핑하는 함수
  const mapDbTypeToFrontendType = (dbType: string): string => {
    switch (dbType) {
      case '선택형': return '객관식';
      case '단답형': return '주관식';
      case '서술형': return '서술형';
      default: return dbType;
    }
  };

  // 프론트엔드 버튼을 DB p_type으로 매핑하는 함수
  const mapFrontendTypeToDbType = (frontendType: string): string => {
    switch (frontendType) {
      case '객관식': return '선택형';
      case '주관식': return '단답형';
      case '서술형': return '서술형';
      default: return frontendType;
    }
  };

  // 현재 선택된 필터가 유효한지 확인
  const isFilterValid = () => {
    return selectedGrade === '중학1학년' && 
           selectedSemester === '1학기' && 
           selectedSubject === '수학';
  };

  // 필터링 결과에 따른 메시지 반환
  const getFilterMessage = () => {
    if (selectedGrade !== '중학1학년') {
      return {
        title: `${selectedGrade} 문제는 준비중입니다`,
        subtitle: '현재 중학1학년 문제만 제공됩니다'
      };
    }
    if (selectedSemester !== '1학기') {
      return {
        title: `${selectedSemester} 문제는 준비중입니다`,
        subtitle: '현재 1학기 문제만 제공됩니다'
      };
    }
    if (selectedSubject !== '수학') {
      return {
        title: `${selectedSubject} 문제는 준비중입니다`,
        subtitle: '현재 수학 문제만 제공됩니다'
      };
    }
    if (selectedCategory === '단원별' && getMainChapters().length === 0) {
      return {
        title: '단원 정보가 없습니다',
        subtitle: '문제를 풀어보시면 단원별로 분류됩니다'
      };
    }
    if (selectedErrorPatterns.length > 0 && getFilteredProblems().length === 0) {
      return {
        title: '선택한 오답 패턴에 맞는 문제가 없습니다',
        subtitle: '다른 오답 패턴을 시도해보세요'
      };
    }
    if (getFilteredProblems().length === 0 && chatProblems.length > 0) {
      return {
        title: '선택한 필터 조건에 맞는 문제가 없습니다',
        subtitle: '다른 필터 조건을 시도해보세요'
      };
    }
    return {
      title: '아직 채팅한 문제가 없습니다',
      subtitle: '문제를 풀어보시면 여기에 표시됩니다'
    };
  };

  // 달력 상태 디버깅
  useEffect(() => {
    console.log('showCalendar 상태 변경:', showCalendar);
  }, [showCalendar]);

  const handleBack = () => {
    // 폴더 생성 후 이동한 경우 또는 사용자 정의 폴더가 활성화된 경우 bookshelf로 이동
    const isUserFolder = userFolders.find(f => f.name === selectedCategory);
    const isFromFolderCreation = params.newFolder; // 폴더 생성 후 이동한 경우
    
    if (isUserFolder || isFromFolderCreation) {
      router.push('/bookshelf');
    } else {
      router.back();
    }
  };

  const toggleUnitExpansion = (unitId: string) => {
    setExpandedUnits(prev => 
      prev.includes(unitId) 
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
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

  const handleArchive = () => {
    // 보관함 페이지로 이동
    router.push('/chat-save');
  };

  const handleAddCategory = () => {
    // 폴더 생성 모달 열기
    setShowFolderModal(true);
  };

  const handleCategoryTabPress = (category: string) => {
    setSelectedCategory(category);
  };

  const handleFolderModalClose = () => {
    setShowFolderModal(false);
    setFolderName('');
    setSelectedClassification('단원별');
  };

  // 사용자 정의 폴더에서 문제 가져오기 (필터링 적용)
  const getProblemsFromUserFolder = (folderName: string) => {
    const folder = userFolders.find(f => f.name === folderName);
    if (!folder) return [];
    
    // 폴더에 포함된 문제들만 가져오기
    let folderProblems = chatProblems.filter(problem => 
      folder.problemIds.includes(problem.conversation_id)
    );
    
    // 오답 리포트가 있는 문제만 필터링
    folderProblems = folderProblems.filter(problem => 
      problem.full_report_content && problem.full_report_content.trim().length > 0
    );
    
    // 추가 필터링 적용 (검색, 기간, 문제 타입, 오답 패턴 등)
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      folderProblems = folderProblems.filter(problem => {
        const textbookName = problem.p_name?.toLowerCase() || '';
        const mainChapter = problem.main_chapt?.toLowerCase() || '';
        const subChapter = problem.sub_chapt?.toLowerCase() || '';
        const contentType = problem.con_type?.toLowerCase() || '';
        const problemType = problem.p_type?.toLowerCase() || '';
        
        return textbookName.includes(searchLower) || 
               mainChapter.includes(searchLower) || 
               subChapter.includes(searchLower) || 
               contentType.includes(searchLower) || 
               problemType.includes(searchLower);
      });
    }
    
    // 조회 기간 필터링
    if (selectedStartDate && selectedEndDate) {
      folderProblems = folderProblems.filter(problem => {
        const problemDate = new Date(problem.started_at);
        const startOfDay = new Date(selectedStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        return problemDate >= startOfDay && problemDate <= endOfDay;
      });
    }
    
    // 문제 출제 방식 필터링
    if (selectedProblemTypes.length > 0) {
      folderProblems = folderProblems.filter(problem => {
        const dbType = problem.p_type;
        const frontendType = mapDbTypeToFrontendType(dbType);
        return selectedProblemTypes.includes(frontendType);
      });
    }
    
    // 오답 패턴 필터링
    if (selectedErrorPatterns.length > 0) {
      folderProblems = folderProblems.filter(problem => {
        const problemPatterns = problem.error_patterns || [];
        return selectedErrorPatterns.some(selectedPattern => 
          problemPatterns.includes(selectedPattern)
        );
      });
    }
    
    // 난이도 필터링
    if (selectedDifficulty && selectedDifficulty !== '전체') {
      folderProblems = folderProblems.filter(problem => {
        const level = problem.p_level;
        switch (selectedDifficulty) {
          case '상': return level === '상중' || level === '상';
          case '중': return level === '중' || level === '중하';
          case '하': return level === '하';
          default: return true;
        }
      });
    }
    
    // 폴더 분류 기준에 따른 정렬
    switch (folder.classification) {
      case '날짜별':
        folderProblems.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        break;
      case '문제집별':
        folderProblems.sort((a, b) => {
          const textbookA = a.p_name || '';
          const textbookB = b.p_name || '';
          return textbookA.localeCompare(textbookB);
        });
        break;
      case '단원별':
        // 단원별 정렬은 별도 UI에서 처리
        break;
    }
    
    return folderProblems;
  };

  // 사용자 정의 폴더 추가
  const addUserFolder = (folderName: string, classification: string, problemIds: string[]) => {
    const newFolder = {
      id: `folder_${Date.now()}`,
      name: folderName,
      classification,
      problemIds
    };
    setUserFolders(prev => [...prev, newFolder]);
    console.log('사용자 폴더 추가됨:', newFolder);
    
    // 알림 표시
    showFolderNotification(folderName);
  };

  // 폴더 생성 알림 표시
  const showFolderNotification = (folderName: string) => {
    setNotificationMessage(`오답노트에 '${folderName}' 폴더가 생성되었습니다!`);
    setShowNotification(true);
    
    // 3초 후 알림 숨기기
    setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  const handleFolderCreate = () => {
    if (!folderName.trim()) {
      console.log('폴더 이름을 입력해주세요');
      return;
    }
    
    // 문제 선택 페이지로 이동
    router.push({
      pathname: '/create-folder',
      params: {
        folderName: folderName,
        classification: selectedClassification
      }
    });
    
    handleFolderModalClose();
  };

  const handleProblemCardPress = (problem: any) => {
    // 문제 카드 클릭 시 리포트 페이지로 이동
    console.log('문제 카드 클릭:', problem);
    router.push({
      pathname: '/problem-report',
      params: { 
        page: problem.p_page || '117',
        number: problem.num_in_page || '812',
        conversationId: problem.conversation_id,
        problemName: problem.p_name || '체크체크 유형체크 N제 1-1'
      }
    });
  };

  const loadChatHistory = async (conversationId: string) => {
    try {
      setLoadingChat(true);
      const token = await getAccessToken();
      if (!token) {
        console.error("토큰이 없습니다");
        return;
      }

      console.log("채팅 내역 조회:", conversationId);
      
      const response = await fetch(`http://52.79.233.106/fastapi/conversations/${conversationId}/report`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log("채팅 내역 데이터:", data);
        
        // full_chat_log에서 메시지 추출
        const messages = data.full_chat_log || [];
        setChatMessages(messages);
      } else {
        console.error("채팅 내역 조회 실패:", response.status);
        const errorText = await response.text();
        console.error("에러 응답:", errorText);
      }
    } catch (error) {
      console.error("채팅 내역 로딩 오류:", error);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleChatModalClose = () => {
    setShowChatModal(false);
    setChatMessages([]);
    setSelectedConversationId('');
  };

  const handleFilterModalOpen = () => {
    setShowFilterModal(true);
  };

  const handleFilterModalClose = () => {
    setShowFilterModal(false);
  };

  const handleFilterApply = () => {
    // 필터 적용 로직
    console.log('🔍 필터 적용:', {
      period: selectedPeriod,
      difficulty: selectedDifficulty,
      problemTypes: selectedProblemTypes,
      errorPatterns: selectedErrorPatterns,
      errorCauses: selectedErrorCauses,
      startDate: selectedStartDate?.toISOString(),
      endDate: selectedEndDate?.toISOString()
    });
    
    // 필터링된 결과 확인
    const filteredProblems = getFilteredProblems();
    console.log('🔍 필터 적용 후 결과:', {
      totalProblems: chatProblems.length,
      filteredProblems: filteredProblems.length,
      period: selectedPeriod,
      hasDateRange: selectedStartDate && selectedEndDate
    });
    
    setShowFilterModal(false);
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    
    // 기간별 자동 날짜 설정
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '1개월':
        // 30일 전
        startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case '3개월':
        // 90일 전
        startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case '6개월':
        // 180일 전
        startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
        break;
      default:
        // 직접 설정의 경우 기존 날짜 유지
        return;
    }
    
    console.log('🔍 기간 설정:', {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      startDateLocal: startDate.toLocaleDateString('ko-KR'),
      endDateLocal: now.toLocaleDateString('ko-KR')
    });
    
    setSelectedStartDate(startDate);
    setSelectedEndDate(now);
  };

  const toggleProblemType = (type: string) => {
    console.log('🔍 문제 출제 방식 토글:', {
      type,
      currentSelected: selectedProblemTypes,
      willInclude: !selectedProblemTypes.includes(type)
    });
    
    setSelectedProblemTypes(prev => {
      const newSelection = prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type];
      
      console.log('🔍 문제 출제 방식 선택 업데이트:', {
        type,
        previous: prev,
        newSelection
      });
      
      return newSelection;
    });
  };

  const toggleErrorCause = (cause: string) => {
    setSelectedErrorCauses(prev => 
      prev.includes(cause) 
        ? prev.filter(c => c !== cause)
        : [...prev, cause]
    );
  };

  const toggleErrorPattern = (pattern: string) => {
    console.log('🔍 오답 패턴 토글:', pattern);
    setSelectedErrorPatterns(prev => {
      const newPatterns = prev.includes(pattern) 
        ? prev.filter(p => p !== pattern)
        : [...prev, pattern];
      console.log('🔍 새로운 오답 패턴 선택:', newPatterns);
      return newPatterns;
    });
  };

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulty(prev => 
      prev === difficulty ? '전체' : difficulty
    );
  };

  // 달력 관련 함수들
  const openCalendar = () => {
    console.log('달력 열기 시도');
    setShowCalendar(true);
    setSelectedDate(null);
    console.log('showCalendar 상태:', true);
  };

  const closeCalendar = () => {
    setShowCalendar(false);
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    
    // 첫 번째 클릭: 시작일 설정
    if (!selectedStartDate) {
      setSelectedStartDate(date);
      setSelectedEndDate(null);
      console.log('시작일 설정:', date.toLocaleDateString());
    } 
    // 두 번째 클릭: 종료일 설정
    else if (!selectedEndDate) {
      if (date >= selectedStartDate) {
        setSelectedEndDate(date);
        console.log('종료일 설정:', date.toLocaleDateString());
      } else {
        // 시작일보다 이전 날짜를 클릭한 경우, 새로운 시작일로 설정
        setSelectedStartDate(date);
        setSelectedEndDate(null);
        console.log('새로운 시작일 설정:', date.toLocaleDateString());
      }
    } 
    // 세 번째 클릭: 새로운 범위 시작
    else {
      setSelectedStartDate(date);
      setSelectedEndDate(null);
      console.log('새로운 범위 시작:', date.toLocaleDateString());
    }
  };

  const confirmDateSelection = () => {
    if (selectedStartDate && selectedEndDate) {
      setShowCalendar(false);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // 이전 달의 날짜들
    const prevMonth = new Date(year, month - 1, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
        isSelected: false,
        isStartDate: false,
        isEndDate: false,
        isInRange: false
      });
    }
    
    // 현재 달의 날짜들
    for (let i = 1; i <= daysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      const isStartDate = selectedStartDate && 
        currentDate.getTime() === selectedStartDate.getTime();
      const isEndDate = selectedEndDate && 
        currentDate.getTime() === selectedEndDate.getTime();
      const isInRange = selectedStartDate && selectedEndDate && 
        currentDate > selectedStartDate && currentDate < selectedEndDate;
      
      days.push({
        date: currentDate,
        isCurrentMonth: true,
        isSelected: isStartDate || isEndDate || isInRange,
        isStartDate,
        isEndDate,
        isInRange
      });
    }
    
    // 다음 달의 날짜들
    const remainingDays = 42 - days.length; // 6주 * 7일 = 42
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        isSelected: false,
        isStartDate: false,
        isEndDate: false,
        isInRange: false
      });
    }
    
    return days;
  };

  const formatDateRange = () => {
    if (selectedStartDate && selectedEndDate) {
      const startStr = selectedStartDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\. /g, '.').replace('.', '');
      const endStr = selectedEndDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\. /g, '.').replace('.', '');
      return `${startStr} - ${endStr}`;
    }
    return '2025.03.02 - 2025.07.26';
  };

  // 동적 카테고리 생성 (기본 + 사용자 폴더)
  const getCategories = () => {
    const baseCategories = ['날짜별', '즐겨찾기', '단원별', '문제집별'];
    const userFolderCategories = userFolders.map(folder => folder.name);
    return [...baseCategories, ...userFolderCategories];
  };
  const grades = ['중학1학년', '중학2학년', '중학3학년'];
  const semesters = ['1학기', '2학기'];
  const subjects = ['수학', '국어', '영어', '과학', '사회'];

  const getMainChapters = () => {
    const mainChapters = new Set<string>();
    const problemsToUse = selectedCategory === '단원별' ? chatProblems : getProblemsFromUserFolder(selectedCategory);
    problemsToUse.forEach(problem => {
      if (problem.main_chapt) {
        mainChapters.add(problem.main_chapt);
      }
    });
    return Array.from(mainChapters).sort();
  };

  const getSubChapters = (mainChapter: string) => {
    const subChapters = new Set<string>();
    const problemsToUse = selectedCategory === '단원별' ? chatProblems : getProblemsFromUserFolder(selectedCategory);
    problemsToUse.forEach(problem => {
      if (problem.main_chapt === mainChapter && problem.sub_chapt) {
        subChapters.add(problem.sub_chapt);
      }
    });
    return Array.from(subChapters).sort();
  };

  const getProblemsBySubChapter = (mainChapter: string, subChapter: string) => {
    const problemsToUse = selectedCategory === '단원별' ? chatProblems : getProblemsFromUserFolder(selectedCategory);
    return problemsToUse.filter(problem => 
      problem.main_chapt === mainChapter && 
      problem.sub_chapt === subChapter &&
      problem.full_report_content && 
      problem.full_report_content.trim().length > 0
    );
  };

  const toggleMainChapter = (mainChapter: string) => {
    setExpandedMainChapters(prev => 
      prev.includes(mainChapter) 
        ? prev.filter(chapter => chapter !== mainChapter)
        : [...prev, mainChapter]
    );
  };

  const toggleSubChapter = (subChapter: string) => {
    setExpandedSubChapters(prev => 
      prev.includes(subChapter) 
        ? prev.filter(chapter => chapter !== subChapter)
        : [...prev, subChapter]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Navigation Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image 
            source={require('@/assets/images/back_page.png')} 
            style={styles.headerIcon} 
          />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{userInfo?.name || "사용자"}님의 오답노트</ThemedText>
        <TouchableOpacity style={styles.trashButton} onPress={handleArchive}>
          <Image 
            source={require('@/assets/images/archive.png')} 
            style={styles.headerIcon} 
          />
        </TouchableOpacity>
      </ThemedView>

      {/* Filters Section */}
      <ThemedView style={styles.filtersSection}>
        <ThemedView style={styles.dropdownRow}>
          <ThemedView style={styles.dropdownContainer}>
            <TouchableOpacity 
              style={styles.dropdownForm}
              onPress={() => setShowGradeDropdown(!showGradeDropdown)}
            >
              <ThemedText style={styles.dropdownTitle}>학년</ThemedText>
              <ThemedView style={styles.dropdownTrailing}>
                <ThemedText style={styles.dropdownDetail}>{selectedGrade}</ThemedText>
                <IconSymbol 
                  name="chevron.down" 
                  size={18} 
                  color="#1D1B20"
                  style={{
                    transform: [{ rotate: showGradeDropdown ? '180deg' : '0deg' }]
                  }}
                />
              </ThemedView>
            </TouchableOpacity>
            {showGradeDropdown && (
              <ThemedView style={styles.dropdownMenu}>
                {grades.map((grade) => {
                  const isAvailable = grade === '중학1학년';
                  return (
                    <TouchableOpacity
                      key={grade}
                      style={[
                        styles.dropdownItem,
                        selectedGrade === grade && styles.selectedDropdownItem,
                        !isAvailable && styles.disabledDropdownItem
                      ]}
                      onPress={() => {
                        if (isAvailable) {
                          setSelectedGrade(grade);
                          setShowGradeDropdown(false);
                        }
                      }}
                      disabled={!isAvailable}
                    >
                      <ThemedText style={[
                        styles.dropdownItemText,
                        selectedGrade === grade && styles.selectedDropdownItemText,
                        !isAvailable && styles.disabledDropdownItemText
                      ]}>
                        {grade}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ThemedView>
            )}
          </ThemedView>

          <ThemedView style={styles.dropdownContainer}>
            <TouchableOpacity 
              style={styles.dropdownForm}
              onPress={() => setShowSemesterDropdown(!showSemesterDropdown)}
            >
              <ThemedText style={styles.dropdownTitle}>학기</ThemedText>
              <ThemedView style={styles.dropdownTrailing}>
                <ThemedText style={styles.dropdownDetail}>{selectedSemester}</ThemedText>
                <IconSymbol 
                  name="chevron.down" 
                  size={18} 
                  color="#1D1B20"
                  style={{
                    transform: [{ rotate: showSemesterDropdown ? '180deg' : '0deg' }]
                  }}
                />
              </ThemedView>
            </TouchableOpacity>
            {showSemesterDropdown && (
              <ThemedView style={styles.dropdownMenu}>
                {semesters.map((semester) => {
                  const isAvailable = semester === '1학기';
                  return (
                    <TouchableOpacity
                      key={semester}
                      style={[
                        styles.dropdownItem,
                        selectedSemester === semester && styles.selectedDropdownItem,
                        !isAvailable && styles.disabledDropdownItem
                      ]}
                      onPress={() => {
                        if (isAvailable) {
                          setSelectedSemester(semester);
                          setShowSemesterDropdown(false);
                        }
                      }}
                      disabled={!isAvailable}
                    >
                      <ThemedText style={[
                        styles.dropdownItemText,
                        selectedSemester === semester && styles.selectedDropdownItemText,
                        !isAvailable && styles.disabledDropdownItemText
                      ]}>
                        {semester}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ThemedView>
            )}
          </ThemedView>

          <ThemedView style={styles.dropdownContainer}>
            <TouchableOpacity 
              style={styles.dropdownForm}
              onPress={() => setShowSubjectDropdown(!showSubjectDropdown)}
            >
              <ThemedText style={styles.dropdownTitle}>과목</ThemedText>
              <ThemedView style={styles.dropdownTrailing}>
                <ThemedText style={styles.dropdownDetail}>{selectedSubject}</ThemedText>
                <IconSymbol 
                  name="chevron.down" 
                  size={18} 
                  color="#1D1B20"
                  style={{
                    transform: [{ rotate: showSubjectDropdown ? '180deg' : '0deg' }]
                  }}
                />
              </ThemedView>
            </TouchableOpacity>
            {showSubjectDropdown && (
              <ThemedView style={styles.dropdownMenu}>
                {subjects.map((subject) => {
                  const isAvailable = subject === '수학';
                  return (
                    <TouchableOpacity
                      key={subject}
                      style={[
                        styles.dropdownItem,
                        selectedSubject === subject && styles.selectedDropdownItem,
                        !isAvailable && styles.disabledDropdownItem
                      ]}
                      onPress={() => {
                        if (isAvailable) {
                          setSelectedSubject(subject);
                          setShowSubjectDropdown(false);
                        }
                      }}
                      disabled={!isAvailable}
                    >
                      <ThemedText style={[
                        styles.dropdownItemText,
                        selectedSubject === subject && styles.selectedDropdownItemText,
                        !isAvailable && styles.disabledDropdownItemText
                      ]}>
                        {subject}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ThemedView>
            )}
          </ThemedView>
          
          {/* Filter Button */}
          <TouchableOpacity style={styles.filterIconButton} onPress={handleFilterModalOpen}>
            <Image source={require('@/assets/images/filter.png')} style={styles.filterIcon} />
          </TouchableOpacity>
        </ThemedView>

        {/* Search Bar */}
        <ThemedView style={styles.searchSection}>
          <ThemedView style={styles.searchBar}>
            <Image 
              source={require('@/assets/images/searchcon.png')} 
              style={styles.searchIcon} 
            />
            <TextInput
              style={styles.searchInput}
              placeholder="문제집명, 단원, 유형 등을 입력하세요"
              value={searchText}
              onChangeText={setSearchText}
              placeholderTextColor="#A8A8A9"
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
            {getCategories().map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryTab,
                  selectedCategory === category && styles.activeCategoryTab
                ]}
                onPress={() => handleCategoryTabPress(category)}
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
          <TouchableOpacity style={styles.addButton} onPress={handleAddCategory}>
            <Image 
              source={require('@/assets/images/plus_folder.png')} 
              style={styles.addButtonImage} 
            />
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* Problems List */}
      <ScrollView style={styles.problemsList} showsVerticalScrollIndicator={false}>
        {loadingProblems ? (
          <ThemedView style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>문제를 불러오는 중...</ThemedText>
          </ThemedView>
        ) : (
          <>
            {(selectedCategory === '단원별' || (userFolders.find(f => f.name === selectedCategory)?.classification === '단원별')) ? (
              // 단원별 UI
              getMainChapters().length > 0 ? (
                <ThemedView style={styles.unitSection}>
                  <ThemedView style={styles.unitHeader}>
                    <ThemedText style={styles.unitTitle}>[중1-1] 수학 2-2. 일차방정식</ThemedText>
                  </ThemedView>
                  
                  {/* 대단원 목록 */}
                  {getMainChapters().map((mainChapter) => (
                    <ThemedView key={mainChapter} style={styles.mainChapterContainer}>
                      {/* 대단원 헤더 */}
                      <TouchableOpacity 
                        style={styles.mainChapterHeader}
                        onPress={() => toggleMainChapter(mainChapter)}
                      >
                        <ThemedText style={styles.mainChapterTitle}>{mainChapter}</ThemedText>
                        <IconSymbol 
                          name={expandedMainChapters.includes(mainChapter) ? "chevron.up" : "chevron.down"} 
                          size={20} 
                          color={colors.text} 
                        />
                      </TouchableOpacity>
                      
                      {/* 소단원 목록 (대단원이 확장된 경우) */}
                      {expandedMainChapters.includes(mainChapter) && (
                        <ThemedView style={styles.subChaptersContainer}>
                          {getSubChapters(mainChapter).map((subChapter) => (
                            <ThemedView key={subChapter} style={styles.subChapterContainer}>
                              {/* 소단원 헤더 */}
                              <TouchableOpacity 
                                style={styles.subChapterHeader}
                                onPress={() => toggleSubChapter(subChapter)}
                              >
                                <ThemedText style={styles.subChapterTitle}>{subChapter}</ThemedText>
                                <IconSymbol 
                                  name={expandedSubChapters.includes(subChapter) ? "chevron.up" : "chevron.down"} 
                                  size={16} 
                                  color={colors.text} 
                                />
                              </TouchableOpacity>
                              
                              {/* 문제 카드들 (소단원이 확장된 경우) */}
                              {expandedSubChapters.includes(subChapter) && (
                                <ThemedView style={styles.problemsGrid}>
                                  {getProblemsBySubChapter(mainChapter, subChapter).map((problem, index) => (
                                    <TouchableOpacity 
                                      key={`unit-${mainChapter}-${subChapter}-${problem.conversation_id}`}
                                      style={styles.problemCard}
                                      onPress={() => handleProblemCardPress(problem)}
                                    >
                                      {/* 이미지 영역 */}
                                      <ThemedView style={styles.problemImageContainer}>
                                        {(() => {
                                          const problemNumber = problem.num_in_page;
                                          const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id || `problem_${Date.now()}`;
                                          
                                          return problemImages[problemId] ? (
                                            <Image
                                              source={{ uri: problemImages[problemId] }}
                                              style={[
                                                styles.problemImage,
                                                imageDimensions[problemId] && {
                                                  width: imageDimensions[problemId].width,
                                                  height: imageDimensions[problemId].height
                                                }
                                              ]}
                                              resizeMode="contain"
                                              onError={() => {
                                                console.error("문제 이미지 로드 실패:", problemId);
                                                setProblemImages(prev => ({
                                                  ...prev,
                                                  [problemId]: 'https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image'
                                                }));
                                              }}
                                            />
                                          ) : (
                                            <ThemedView style={styles.imagePlaceholder}>
                                              <IconSymbol name="doc.text" size={32} color="#fff" />
                                              <ThemedText style={styles.placeholderText}>이미지 로딩 중...</ThemedText>
                                            </ThemedView>
                                          );
                                        })()}
                                      </ThemedView>
                                      
                                      {/* 하단 정보 영역 */}
                                      <ThemedView style={styles.problemFooter}>
                                        <ThemedView style={styles.problemInfo}>
                                          <ThemedText style={styles.problemBookName}>
                                            {problem.p_name || `문제 ${index + 1}`} {problem.p_page && problem.num_in_page 
                                              ? `p.${problem.p_page} ${problem.num_in_page}번`
                                              : '페이지 정보 없음'
                                            }
                                          </ThemedText>
                                        </ThemedView>
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
                                    </TouchableOpacity>
                                  ))}
                                </ThemedView>
                              )}
                            </ThemedView>
                          ))}
                        </ThemedView>
                      )}
                    </ThemedView>
                  ))}
                </ThemedView>
              ) : (
                <ThemedView style={styles.emptyStateContainer}>
                  <ThemedText style={styles.emptyStateText}>
                    {getFilterMessage().title}
                  </ThemedText>
                  <ThemedText style={styles.emptyStateSubText}>
                    {getFilterMessage().subtitle}
                  </ThemedText>
                </ThemedView>
              )
            ) : getFilteredProblems().length > 0 ? (
              // 기존 UI (날짜별, 즐겨찾기, 문제집별)
              <ThemedView style={styles.unitSection}>
                <ThemedView style={styles.unitHeader}>
                  <ThemedText style={styles.unitTitle}>
                    {selectedCategory === '문제집별' 
                      ? getFilteredProblems()[0]?.p_name || '유형체크 N제 수학 중1-1'
                      : '유형체크 N제 수학 중1-1'
                    }
                  </ThemedText>
                  <ThemedText style={styles.problemCount}>{getFilteredProblems().length} 문제</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.problemsGrid}>
                  {getFilteredProblems().map((problem, index) => (
                    <TouchableOpacity 
                      key={`general-${problem.conversation_id}`}
                      style={styles.problemCard}
                      onPress={() => handleProblemCardPress(problem)}
                    >
                      {/* 이미지 영역 */}
                      <ThemedView style={styles.problemImageContainer}>
                        {(() => {
                          const problemNumber = problem.num_in_page;
                          const problemId = problemNumber ? String(problemNumber).padStart(4, '0') : problem.conversation_id || `problem_${Date.now()}`;
                          
                          return problemImages[problemId] ? (
                            <Image
                              source={{ uri: problemImages[problemId] }}
                              style={[
                                styles.problemImage,
                                imageDimensions[problemId] && {
                                  width: imageDimensions[problemId].width,
                                  height: imageDimensions[problemId].height
                                }
                              ]}
                              resizeMode="contain"
                              onError={() => {
                                console.error("문제 이미지 로드 실패:", problemId);
                                setProblemImages(prev => ({
                                  ...prev,
                                  [problemId]: 'https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image'
                                }));
                              }}
                            />
                          ) : (
                            <ThemedView style={styles.imagePlaceholder}>
                              <IconSymbol name="doc.text" size={32} color="#fff" />
                              <ThemedText style={styles.placeholderText}>이미지 로딩 중...</ThemedText>
                            </ThemedView>
                          );
                        })()}
                      </ThemedView>
                      
                      {/* 하단 정보 영역 */}
                      <ThemedView style={styles.problemFooter}>
                        <ThemedView style={styles.problemInfo}>
                          <ThemedText style={styles.problemBookName}>
                            {problem.p_name || `문제 ${index + 1}`} {problem.p_page && problem.num_in_page 
                              ? `p.${problem.p_page} ${problem.num_in_page}번`
                              : '페이지 정보 없음'
                            }
                          </ThemedText>
                        </ThemedView>
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
                    </TouchableOpacity>
                  ))}
                </ThemedView>
              </ThemedView>
            ) : (
              <ThemedView style={styles.emptyStateContainer}>
                <ThemedText style={styles.emptyStateText}>
                  {getFilterMessage().title}
                </ThemedText>
                <ThemedText style={styles.emptyStateSubText}>
                  {getFilterMessage().subtitle}
                </ThemedText>
              </ThemedView>
            )}
          </>
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleFilterModalClose}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.filterModalContent}>
            {/* Modal Header */}
            <ThemedView style={styles.filterModalHeader}>
              <TouchableOpacity onPress={handleFilterModalClose} style={styles.filterModalCloseButton}>
                <Image 
                  source={require('@/assets/images/close.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <ThemedText style={styles.filterModalTitle}>Filter</ThemedText>
              <TouchableOpacity onPress={handleFilterApply} style={styles.filterModalApplyButton}>
                <Image 
                  source={require('@/assets/images/uploads.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
            </ThemedView>
            
            {/* Drag Handle */}
            <ThemedView style={styles.dragHandle} />

            {/* 조회 기간 Section */}
            <ThemedView style={styles.filterSection}>
              <ThemedText style={styles.filterSectionTitle}>조회 기간</ThemedText>
              <ThemedView style={styles.filterButtonRow}>
                {['1개월', '3개월', '6개월', '직접 설정'].map((period) => (
                  <TouchableOpacity
                    key={period}
                    style={[
                      styles.filterButton,
                      selectedPeriod === period && styles.selectedFilterButton
                    ]}
                    onPress={() => handlePeriodChange(period)}
                  >
                    <ThemedText style={[
                      styles.filterButtonText,
                      selectedPeriod === period && styles.selectedFilterButtonText
                    ]}>
                      {period}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
              
              {/* 선택된 기간 표시 */}
              {selectedPeriod !== '직접 설정' && selectedStartDate && selectedEndDate && (
                <ThemedView style={styles.selectedPeriodInfo}>
                  <ThemedText style={styles.selectedPeriodText}>
                    {selectedStartDate.toLocaleDateString('ko-KR')} ~ {selectedEndDate.toLocaleDateString('ko-KR')}
                  </ThemedText>
                </ThemedView>
              )}
              {selectedPeriod === '직접 설정' && (
                <ThemedView>
                  <TouchableOpacity 
                    style={styles.dateRangeInput} 
                    onPress={openCalendar}
                    activeOpacity={0.7}
                  >
                    <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <IconSymbol name="calendar" size={16} color="#666" />
                      <ThemedText style={styles.dateRangeText}>{formatDateRange()}</ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                  
                  {showCalendar && (
                    <ThemedView style={styles.calendarContainer}>
                      {/* Calendar Header */}
                      <ThemedView style={styles.calendarHeader}>
                        <TouchableOpacity onPress={closeCalendar} style={styles.calendarCloseButton}>
                          <Image 
                            source={require('@/assets/images/white_close.png')} 
                            style={styles.headerIcon} 
                          />
                        </TouchableOpacity>
                        <ThemedText style={styles.calendarTitle}>날짜 선택</ThemedText>
                        <ThemedView style={styles.calendarSpacer} />
                      </ThemedView>

                      {/* Calendar Body */}
                      <ThemedView style={styles.calendarBody}>
                        {/* Month Navigation */}
                        <ThemedView style={styles.monthNavigation}>
                          <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrow}>
                            <Image 
                              source={require('@/assets/images/back_page.png')} 
                              style={styles.calheaderIcon} 
                            />
                          </TouchableOpacity>
                          <ThemedText style={styles.monthTitle}>
                            {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                          </ThemedText>
                          <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrow}>
                            <IconSymbol name="chevron.right" size={24} color="#000" />
                          </TouchableOpacity>
                        </ThemedView>

                        {/* Days of Week */}
                        <ThemedView style={styles.daysOfWeek}>
                          {['월', '화', '수', '목', '금', '토', '일'].map((day) => (
                            <ThemedView key={day} style={styles.dayOfWeek}>
                              <ThemedText style={styles.dayOfWeekText}>{day}</ThemedText>
                            </ThemedView>
                          ))}
                        </ThemedView>

                        {/* Selection Guide */}
                        <ThemedView style={styles.selectionGuide}>
                          <ThemedText style={styles.selectionGuideText}>
                            {!selectedStartDate 
                              ? '시작일을 선택하세요' 
                              : !selectedEndDate 
                                ? '종료일을 선택하세요'
                                : '날짜 범위가 선택되었습니다'
                            }
                          </ThemedText>
                          {selectedStartDate && (
                            <ThemedText style={styles.selectedDateText}>
                              시작일: {selectedStartDate.toLocaleDateString('ko-KR')}
                              {selectedEndDate && ` | 종료일: ${selectedEndDate.toLocaleDateString('ko-KR')}`}
                            </ThemedText>
                          )}
                        </ThemedView>

                        {/* Calendar Grid */}
                        <ThemedView style={styles.calendarGrid}>
                          {getDaysInMonth(currentMonth).map((day, index) => (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.calendarDay,
                                !day.isCurrentMonth && styles.calendarDayDisabled,
                                day.isStartDate && styles.calendarDayStartDate,
                                day.isEndDate && styles.calendarDayEndDate,
                                day.isInRange && styles.calendarDayInRange
                              ]}
                              onPress={() => day.isCurrentMonth && selectDate(day.date)}
                            >
                              <ThemedText style={[
                                styles.calendarDayText,
                                !day.isCurrentMonth && styles.calendarDayTextDisabled,
                                day.isStartDate && styles.calendarDayTextSelected,
                                day.isEndDate && styles.calendarDayTextSelected,
                                day.isInRange && styles.calendarDayTextInRange
                              ]}>
                                {day.date.getDate()}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </ThemedView>
                      </ThemedView>

                      {/* Calendar Footer */}
                      <ThemedView style={styles.calendarFooter}>
                        <TouchableOpacity 
                          style={[
                            styles.calendarConfirmButton,
                            (!selectedStartDate || !selectedEndDate) && styles.calendarConfirmButtonDisabled
                          ]}
                          onPress={confirmDateSelection}
                          disabled={!selectedStartDate || !selectedEndDate}
                        >
                          <ThemedText style={styles.calendarConfirmButtonText}>
                            {selectedStartDate && selectedEndDate 
                              ? `${selectedStartDate.getFullYear()}-${String(selectedStartDate.getMonth() + 1).padStart(2, '0')}-${String(selectedStartDate.getDate()).padStart(2, '0')} 선택`
                              : 'YYYY-MM-DD 선택'
                            }
                          </ThemedText>
                        </TouchableOpacity>
                      </ThemedView>
                    </ThemedView>
                  )}
                </ThemedView>
              )}
            </ThemedView>

            {/* 난이도 Section */}
            <ThemedView style={styles.filterSection}>
              <ThemedText style={styles.filterSectionTitle}>난이도</ThemedText>
              <ThemedView style={styles.filterButtonRow}>
                {['전체', '상', '중', '하'].map((difficulty) => (
                  <TouchableOpacity
                    key={difficulty}
                    style={[
                      styles.filterButton,
                      selectedDifficulty === difficulty && styles.selectedFilterButton
                    ]}
                    onPress={() => toggleDifficulty(difficulty)}
                  >
                    <ThemedText style={[
                      styles.filterButtonText,
                      selectedDifficulty === difficulty && styles.selectedFilterButtonText
                    ]}>
                      {difficulty}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
            </ThemedView>

            {/* 문제 출제 방식 Section */}
            <ThemedView style={styles.filterSection}>
              <ThemedText style={styles.filterSectionTitle}>문제 출제 방식</ThemedText>
              <ThemedView style={styles.filterButtonRow}>
                {['객관식', '주관식', '서술형'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.filterButton,
                      selectedProblemTypes.includes(type) && styles.selectedFilterButton
                    ]}
                    onPress={() => toggleProblemType(type)}
                  >
                    <ThemedText style={[
                      styles.filterButtonText,
                      selectedProblemTypes.includes(type) && styles.selectedFilterButtonText
                    ]}>
                      {type}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
            </ThemedView>

            {/* 오답 패턴별 Section */}
            <ThemedView style={styles.filterSection}>
              <ThemedText style={styles.filterSectionTitle}>오답 패턴별</ThemedText>
              <ThemedView style={styles.errorCausesGrid}>
                {errorPatternOptions.map((pattern) => (
                  <TouchableOpacity
                    key={pattern}
                    style={[
                      styles.errorCauseButton,
                      selectedErrorPatterns.includes(pattern) && styles.selectedFilterButton
                    ]}
                    onPress={() => toggleErrorPattern(pattern)}
                  >
                    <ThemedText style={[
                      styles.filterButtonText,
                      selectedErrorPatterns.includes(pattern) && styles.selectedFilterButtonText
                    ]}>
                      {pattern}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Chat History Modal */}
      <Modal
        visible={showChatModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleChatModalClose}
      >
        <ThemedView style={styles.chatModalOverlay}>
          <ThemedView style={styles.chatModalContent}>
            {/* Modal Header */}
            <ThemedView style={styles.chatModalHeader}>
              <TouchableOpacity onPress={handleChatModalClose} style={styles.chatModalCloseButton}>
              <Image 
                  source={require('@/assets/images/close.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <ThemedText style={styles.chatModalTitle}>질문 내용 다시 보기</ThemedText>
              <ThemedView style={styles.chatModalSpacer} />
            </ThemedView>
            
            {/* Chat Messages */}
            <ScrollView style={styles.chatMessagesContainer} showsVerticalScrollIndicator={false}>
              {loadingChat ? (
                <ThemedView style={styles.chatLoadingContainer}>
                  <ThemedText style={styles.chatLoadingText}>채팅 내역을 불러오는 중...</ThemedText>
                </ThemedView>
              ) : chatMessages.length > 0 ? (
                chatMessages.map((message, index) => (
                  <ThemedView key={index} style={styles.chatMessageContainer}>
                    {message.sender_role === 'dasida' ? (
                      <ThemedView style={styles.aiMessageContainer}>
                        <ThemedView style={styles.aiAvatar}>
                          <IconSymbol name="person.fill" size={20} color="#fff" />
                        </ThemedView>
                        <ThemedText style={styles.aiName}>매쓰천재</ThemedText>
                        <ThemedView style={styles.aiMessageBubble}>
                          <ThemedText style={styles.aiMessageText}>{removeMetadataFromMessage(message.message)}</ThemedText>
                        </ThemedView>
                      </ThemedView>
                    ) : (
                      <ThemedView style={styles.userMessageContainer}>
                        <ThemedView style={styles.userMessageBubble}>
                          <ThemedText style={styles.userMessageText}>{removeMetadataFromMessage(message.message)}</ThemedText>
                        </ThemedView>
                      </ThemedView>
                    )}
                  </ThemedView>
                ))
              ) : (
                <ThemedView style={styles.chatEmptyContainer}>
                  <ThemedText style={styles.chatEmptyText}>채팅 내역이 없습니다.</ThemedText>
                </ThemedView>
              )}
            </ScrollView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Folder Creation Modal */}
      <Modal
        visible={showFolderModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleFolderModalClose}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.folderModalContent}>
            {/* Modal Header */}
            <ThemedView style={styles.folderModalHeader}>
              <TouchableOpacity onPress={handleFolderModalClose} style={styles.folderModalCloseButton}>
                <Image 
                  source={require('@/assets/images/close.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <ThemedText style={styles.folderModalTitle}>폴더생성</ThemedText>
              <TouchableOpacity onPress={handleFolderCreate} style={styles.folderModalCreateButton}>
                <Image 
                  source={require('@/assets/images/uploads.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
            </ThemedView>
            
            {/* Folder Name Input */}
            <ThemedView style={styles.folderInputSection}>
              <ThemedText style={styles.folderInputLabel}>폴더 이름</ThemedText>
              <TextInput
                style={[styles.folderNameInput, { color: colors.text }]}
                placeholder="폴더명을 입력하세요"
                placeholderTextColor="#666"
                value={folderName}
                onChangeText={setFolderName}
              />
            </ThemedView>
            
            {/* Classification Selection */}
            <ThemedView style={styles.classificationSection}>
              <ThemedText style={styles.classificationLabel}>분류기준</ThemedText>
              <ThemedView style={styles.classificationButtons}>
                {['단원별', '문제집별', '날짜별'].map((classification) => {
                  const isDisabled = classification === '문제집별';
                  return (
                    <TouchableOpacity
                      key={classification}
                      style={[
                        styles.classificationButton,
                        selectedClassification === classification && styles.selectedClassificationButton,
                        isDisabled && styles.disabledClassificationButton
                      ]}
                      onPress={() => !isDisabled && setSelectedClassification(classification)}
                      disabled={isDisabled}
                    >
                      <ThemedText style={[
                        styles.classificationButtonText,
                        selectedClassification === classification && styles.selectedClassificationButtonText,
                        isDisabled && styles.disabledClassificationButtonText
                      ]}>
                        {classification}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Folder Creation Notification */}
      {showNotification && (
        <ThemedView style={styles.notificationContainer}>
          <ThemedText style={styles.notificationText}>
            {notificationMessage}
          </ThemedText>
        </ThemedView>
      )}

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
  headerIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  calheaderIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  trashButton: {
    padding: 8,
  },
  filtersSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  dropdownRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 8,
    justifyContent: 'space-between',
  },
  dropdownContainer: {
    width: 229,
    height: 52,
    position: 'relative',
  },
  dropdownWrapper: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    padding: 0,
    width: 229,
    height: 52,
  },
  dropdownTitle: {
    fontWeight: '400',
    fontSize: 17,
    lineHeight: 22,
    color: '#000000',
  },
  dropdownForm: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 20,
    paddingRight: 8,
    width: 229,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#BEBEBE',
    borderRadius: 8,
  },
  dropdownTrailing: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 17,
    paddingRight: 10,
    width: 153,
    height: 36,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  dropdownDetail: {
    width: 91,
    height: 22,
    fontWeight: '400',
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
    color: 'rgba(60, 60, 67, 0.6)',
    flex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
    marginTop: 8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  dropdownText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '400',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  selectedDropdownItem: {
    backgroundColor: '#F0F8FF',
  },
  selectedDropdownItemText: {
    color: '#3861DA',
    fontWeight: '600',
  },
  disabledDropdownItem: {
    backgroundColor: '#F8F8F8',
    opacity: 0.6,
  },
  disabledDropdownItemText: {
    color: '#999',
    fontWeight: '400',
  },
  selectedPeriodInfo: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E3F2FD',
  },
  selectedPeriodText: {
    fontSize: 14,
    color: '#3861DA',
    fontWeight: '500',
    textAlign: 'center',
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
    backgroundColor: '#E9E9EA',
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
    color: '#A8A8A9',
    fontWeight: '400',
    marginLeft: 8,
    textAlign: 'left',
    textAlignVertical: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    includeFontPadding: false,
  },
  searchIcon: {
    width: 21,
    height: 21,
    resizeMode: 'contain',
  },
  filterIconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
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
    width: 65,
    height: 65,
    right: 0,
    top: -8,
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
    backgroundColor: '#ffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  problemsList: {
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
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginBottom: 12,
    height: 150,
    overflow: 'hidden',
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
  problemPageInfo: {
    fontSize: 11,
    color: '#666',
  },
  problemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  problemTypeLabel: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  problemTypeText: {
    fontSize: 10,
    color: '#666',
  },
  problemContentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  problemContent: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: '#333',
    marginBottom: 8,
  },
  problemImage: {
    borderRadius: 8,
    backgroundColor: '#fff',
    resizeMode: 'contain',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
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
  problemNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3861DA',
    marginBottom: 8,
  },
  problemSource: {
    fontSize: 11,
    color: '#3861DA',
    marginTop: 'auto',
    marginBottom: 24,
  },
  bookmarkButton: {
    padding: 4,
  },
  bookmarkIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    width: '90%',
    margin: 20,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  filterModalCloseButton: {
    padding: 8,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  filterModalApplyButton: {
    width: 40,
    height: 40,
    borderRadius: 100,
    backgroundColor: '#3861DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  filterButtonRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flex: 1,
  },
  selectedFilterButton: {
    backgroundColor: '#3861DA',
    borderColor: '#3861DA',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
  selectedFilterButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  dateRangeInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateRangeText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  errorCausesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  errorCauseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    width: '33.33%',
    marginBottom: 0,
  },
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
  // Chat Modal Styles
  chatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  chatModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
  },
  chatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  chatModalCloseButton: {
    padding: 8,
  },
  chatModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  chatModalSpacer: {
    width: 40,
  },
  chatMessagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  chatLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  chatLoadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  chatMessageContainer: {
    marginBottom: 16,
  },
  aiMessageContainer: {
    alignItems: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  aiName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  aiMessageBubble: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  aiMessageText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  userMessageBubble: {
    backgroundColor: '#3861DA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  userMessageText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  chatEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  chatEmptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Calendar Styles
  calendarContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3861DA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 60,
  },
  calendarCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  calendarSpacer: {
    width: 44,
  },
  calendarBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    maxHeight: 400,
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  daysOfWeek: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayOfWeek: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayOfWeekText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#BEBEBE',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  calendarDayDisabled: {
    opacity: 0.5,
  },
  calendarDayStartDate: {
    backgroundColor: '#3861DA',
    borderRadius: 20,
  },
  calendarDayEndDate: {
    backgroundColor: '#3861DA',
    borderRadius: 20,
  },
  calendarDayInRange: {
    backgroundColor: 'rgba(56, 97, 218, 0.2)',
  },
  calendarDayText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#000',
  },
  calendarDayTextDisabled: {
    color: '#BEBEBE',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayTextInRange: {
    color: '#3861DA',
    fontWeight: '600',
  },
  selectionGuide: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectionGuideText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  selectedDateText: {
    fontSize: 12,
    color: '#3861DA',
    fontWeight: '500',
    textAlign: 'center',
  },
  calendarFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  calendarConfirmButton: {
    backgroundColor: '#3861DA',
    borderRadius: 0,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarConfirmButtonDisabled: {
    backgroundColor: '#E5E5E5',
  },
  calendarConfirmButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  // Folder Modal Styles
  folderModalContent: {
    width: '60%',
    backgroundColor: '#fff',
    borderRadius: 25,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  folderModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  folderModalCloseButton: {
    width: 48,
    height: 48,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderModalTitle: {
    fontSize: 20,
    fontFamily: 'ProximaNova-Bold',
    fontWeight: '600',
    color: '#333',
  },
  folderModalCreateButton: {
    width: 40,
    height: 40,
    fontFamily: 'ProximaNova-Bold',
    borderRadius: 20,
    backgroundColor: '#3861DA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderInputSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  folderInputLabel: {
    fontSize: 16,
    fontFamily: 'ProximaNova-Bold',
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  folderNameInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  classificationSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  classificationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  classificationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  classificationButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  selectedClassificationButton: {
    backgroundColor: '#3861DA',
    borderColor: '#3861DA',
  },
  classificationButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  selectedClassificationButtonText: {
    color: '#fff',
  },
  disabledClassificationButton: {
    backgroundColor: '#F8F8F8',
    borderColor: '#E5E5E5',
    opacity: 0.6,
  },
  disabledClassificationButtonText: {
    color: '#999',
  },
  mainChapterContainer: {
    marginBottom: 16,
  },
  mainChapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  mainChapterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subChaptersContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  subChapterContainer: {
    marginBottom: 16,
  },
  subChapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
  },
  subChapterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  // Notification Styles
  notificationContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: '#4A4A4A',
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  notificationText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
  },
});
