import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Modal, View, Animated, Dimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
// import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { api } from '@/src/http';
import { getAccessToken } from '@/src/auth';

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

// 채팅 메시지 타입 정의
interface ChatMessage {
  chat_id: number;
  sender_role: string;
  message: string;
  message_type: string;
  created_at: string;
}

interface ConversationData {
  conversation_id: string;
  full_chat_log: ChatMessage[];
  started_at: string;
  completed_at?: string;
}

// 리포트 데이터 타입 정의
interface ReportData {
  dasidaHint?: string;
  errorAnalysis?: string;
  correctSolution?: string;
  keyConcept?: string;
  hasData: boolean;
}

// 유사문제 데이터 타입 정의
interface SimilarProblemData {
  sim_p_id: number;
  p_name: string;
  p_page: number;
  num_in_page: string;
  p_img_url: string;
  main_chapt: string;
  sub_chapt: string;
  con_type: string;
  p_type: string;
  p_level: string;
  p_text: string;
  answer: string;
  solution: string;
}

export default function ProblemReportScreen() {
  const { page, number, conversationId, problemName } = useLocalSearchParams<{ 
    page?: string; 
    number?: string; 
    conversationId?: string;
    problemName?: string;
  }>();
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [activeTab, setActiveTab] = useState('오답 원인 분석');
  const [showPopup, setShowPopup] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [conversationData, setConversationData] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData>({
    hasData: false
  });
  const [loadingReport, setLoadingReport] = useState(true);
  const [similarProblemData, setSimilarProblemData] = useState<SimilarProblemData | null>(null);
  const [loadingSimilarProblem, setLoadingSimilarProblem] = useState(false);
  const [problemImageDimensions, setProblemImageDimensions] = useState<{width: number, height: number} | null>(null);
  
  // 이미지 크기 계산 함수
  const calculateProblemImageSize = (imageUrl: string, containerWidth: number, maxHeight: number) => {
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
        console.error('문제 이미지 크기 계산 실패:', error);
        resolve({ width: containerWidth, height: maxHeight });
      });
    });
  };
  
  // 툴바 버튼 상태
  const [selectedTool, setSelectedTool] = useState<'black' | 'red' | 'blue' | 'highlight' | 'erase'>('black');
  const [temporaryActiveTool, setTemporaryActiveTool] = useState<'back' | 'front' | null>(null);
  
  // 툴바 표시 상태 - 초기값을 false로 변경 (읽기 모드)
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  
  // 툴바 애니메이션 값 - 초기값을 0으로 변경 (읽기 모드)
  const toolbarAnimation = useRef(new Animated.Value(0)).current;

  // 필기 기능을 위한 상태
  const [strokes, setStrokes] = useState<any[]>([]);
  const [currentStroke, setCurrentStroke] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastTouchTime, setLastTouchTime] = useState(0);
  const [touchStartTime, setTouchStartTime] = useState(0);
  
  // 자연스러운 필기를 위한 추가 상태
  const [lastPoint, setLastPoint] = useState<any>(null);
  const [strokeVelocity, setStrokeVelocity] = useState(0);
  const [strokePressure, setStrokePressure] = useState(1);
  
  // 필기 히스토리 관리
  const [drawingHistory, setDrawingHistory] = useState<any[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 리포트 데이터 파싱 함수
  const parseReportData = (reportText: string): ReportData => {
    const result: ReportData = {
      hasData: false
    };

    if (!reportText) {
      return result;
    }

    // 다시다 한 스푼 추출
    const dasidaHintMatch = reportText.match(/\*\*다시다 한 스푼\*\*\s*\n(.*?)(?=\n\n\*\*|$)/s);
    if (dasidaHintMatch) {
      result.dasidaHint = dasidaHintMatch[1].trim();
    }

    // 오답 패턴과 원인 추출 (API 응답 구조에 맞춤)
    const errorPatternMatch = reportText.match(/\*\*오답 패턴\*\*:\s*(.*?)(?=\n\n\*\*오답 원인\*\*|\n\n\*\*다시다 한 스푼\*\*|\n\n\*\*올바른 풀이\*\*|\n\n\*\*핵심 개념\*\*|$)/s);
    const errorCauseMatch = reportText.match(/\*\*오답 원인\*\*\s*\n(.*?)(?=\n\n\*\*다시다 한 스푼\*\*|\n\n\*\*올바른 풀이\*\*|\n\n\*\*핵심 개념\*\*|$)/s);
    
    if (errorPatternMatch || errorCauseMatch) {
      let errorAnalysis = '';
      if (errorPatternMatch) {
        errorAnalysis += errorPatternMatch[1].trim();
      }
      if (errorCauseMatch) {
        if (errorAnalysis) errorAnalysis += '\n\n';
        errorAnalysis += errorCauseMatch[1].trim();
      }
      result.errorAnalysis = errorAnalysis;
    }

    // 올바른 풀이 추출 (올바른 풀이 또는 정답 및 해설)
    const correctSolutionMatch = reportText.match(/\*\*올바른 풀이\*\*\s*\n(.*?)(?=\n\n\*\*핵심 개념\*\*|$)/s);
    const answerSolutionMatch = reportText.match(/\*\*정답 및 해설\*\*\s*\n(.*?)(?=\n\n\*\*핵심 개념\*\*|$)/s);
    
    if (correctSolutionMatch) {
      result.correctSolution = correctSolutionMatch[1].trim();
    } else if (answerSolutionMatch) {
      result.correctSolution = answerSolutionMatch[1].trim();
    }

    // 핵심 개념 추출
    const keyConceptMatch = reportText.match(/\*\*핵심 개념\*\*\s*\n(.*?)(?=\n\n\*\*|$)/s);
    if (keyConceptMatch) {
      result.keyConcept = keyConceptMatch[1].trim();
    }

    // 만약 위의 패턴으로 찾지 못했다면, 더 유연한 패턴으로 시도
    if (!result.dasidaHint) {
      const hintMatch = reportText.match(/다시다 한 스푼[^\n]*\n(.*?)(?=\n\n|\*\*|$)/s);
      if (hintMatch) {
        result.dasidaHint = hintMatch[1].trim();
      }
    }

    if (!result.errorAnalysis) {
      const errorPatternMatch = reportText.match(/오답 패턴[^\n]*\n(.*?)(?=\n\n오답 원인|\n\n다시다 한 스푼|\n\n올바른 풀이|\n\n핵심 개념|$)/s);
      const errorCauseMatch = reportText.match(/오답 원인[^\n]*\n(.*?)(?=\n\n다시다 한 스푼|\n\n올바른 풀이|\n\n핵심 개념|$)/s);
      
      if (errorPatternMatch || errorCauseMatch) {
        let errorAnalysis = '';
        if (errorPatternMatch) {
          errorAnalysis += errorPatternMatch[1].trim();
        }
        if (errorCauseMatch) {
          if (errorAnalysis) errorAnalysis += '\n\n';
          errorAnalysis += errorCauseMatch[1].trim();
        }
        result.errorAnalysis = errorAnalysis;
      }
    }

    if (!result.correctSolution) {
      const solutionMatch = reportText.match(/올바른 풀이[^\n]*\n(.*?)(?=\n\n핵심 개념|$)/s);
      const answerSolutionMatch2 = reportText.match(/정답 및 해설[^\n]*\n(.*?)(?=\n\n핵심 개념|$)/s);
      
      if (solutionMatch) {
        result.correctSolution = solutionMatch[1].trim();
      } else if (answerSolutionMatch2) {
        result.correctSolution = answerSolutionMatch2[1].trim();
      }
    }

    if (!result.keyConcept) {
      const keyConceptMatch2 = reportText.match(/핵심 개념[^\n]*\n(.*?)(?=\n\n|$)/s);
      if (keyConceptMatch2) {
        result.keyConcept = keyConceptMatch2[1].trim();
      }
    }

    result.hasData = !!(result.dasidaHint || result.errorAnalysis || result.correctSolution || result.keyConcept);
    return result;
  };

  // 리포트 데이터 로드
  const loadReportData = async () => {
    if (!conversationId) {
      setLoadingReport(false);
      return;
    }

    try {
      setLoadingReport(true);
      const token = await getAccessToken();
      if (!token) {
        console.error('토큰이 없습니다');
        setLoadingReport(false);
        return;
      }

      // reports 테이블에서 full_report_content 가져오기
      const response = await fetch(`http://52.79.233.106/fastapi/reports/${conversationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('reports 테이블 데이터 로드 성공:', data);
        
        if (data.full_report_content) {
          const parsedData = parseReportData(data.full_report_content);
          setReportData(parsedData);
          
          // p_id가 있으면 유사문제도 로드
          if (data.p_id) {
            loadSimilarProblemData(data.p_id);
          }
        } else {
          console.log('full_report_content가 없습니다');
          setReportData({ hasData: false });
        }
      } else {
        const errorText = await response.text();
        // console.error('reports 테이블 데이터 로드 실패:', response.status, errorText);
        setReportData({ hasData: false });
      }
    } catch (error) {
      console.error('리포트 데이터 로드 오류:', error);
      setReportData({ hasData: false });
    } finally {
      setLoadingReport(false);
    }
  };


  // 유사문제 데이터 로드
  const loadSimilarProblemData = async (p_id: number) => {
    try {
      setLoadingSimilarProblem(true);
      const token = await getAccessToken();
      if (!token) {
        console.error('토큰이 없습니다');
        setLoadingSimilarProblem(false);
        return;
      }

      const response = await fetch(`http://52.79.233.106/fastapi/similar-problems/${p_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('유사문제 데이터 로드 성공:', data);
        setSimilarProblemData(data);
      } else {
        const errorText = await response.text();
        // console.error('유사문제 데이터 로드 실패:', response.status, errorText);
        setSimilarProblemData(null);
      }
    } catch (error) {
      console.error('유사문제 데이터 로드 오류:', error);
      setSimilarProblemData(null);
    } finally {
      setLoadingSimilarProblem(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [conversationId]);

  // 컴포넌트 마운트 시 초기 상태를 히스토리에 저장
  useEffect(() => {
    // 빈 필기 상태를 히스토리에 저장
    saveToHistory([]);
  }, []);

  // 문제 이미지 크기 계산
  useEffect(() => {
    const loadProblemImageSize = async () => {
      if (number) {
        const imageUrl = `http://52.79.233.106:80/uploads/problem_img/checkN_${number.padStart(4, '0')}.png`;
        const screenWidth = Dimensions.get('window').width;
        const containerWidth = screenWidth - 32 - 32; // 화면너비 - 좌우패딩 - 컨테이너패딩
        const maxHeight = 300;
        
        try {
          const dimensions = await calculateProblemImageSize(imageUrl, containerWidth, maxHeight);
          setProblemImageDimensions(dimensions);
        } catch (error) {
          console.error('문제 이미지 크기 계산 오류:', error);
        }
      }
    };
    
    loadProblemImageSize();
  }, [number]);

  const handleBack = () => {
    router.back();
  };

  const handleClose = () => {
    router.back();
  };

  const handleHistory = () => {
    // 질문 내역 다시보기
    console.log('질문 내역 다시보기');
  };

  const handleSave = () => {
    // 필기 저장
    alert('[필기 저장 기능]\n추후 지원 예정입니다.');
  };

  const handleViewMode = () => {
    console.log('보기 버튼 클릭 - 읽기/쓰기 모드 전환');
    
    // 툴바 표시/숨김 토글
    const newVisibility = !isToolbarVisible;
    setIsToolbarVisible(newVisibility);
    
    console.log(`모드 전환: ${newVisibility ? '쓰기 모드' : '읽기 모드'}`);
    
    // 애니메이션 실행
    Animated.timing(toolbarAnimation, {
      toValue: newVisibility ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleUndo = async () => {
    // 질문 내역 다시보기
    setLoading(true);
    try {
      if (conversationId) {
        // conversationId가 있는 경우 실제 데이터 가져오기 시도
        try {
          const token = await getAccessToken();
          if (token) {
            // chatlog-page.tsx와 동일한 API 엔드포인트 사용
            const response = await fetch(`http://52.79.233.106/fastapi/conversations/${conversationId}/report`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log('채팅 데이터 로드 성공:', data);
              
              // full_chat_log에서 메시지 추출 (chatlog-page.tsx와 동일한 방식)
              const messages = data.full_chat_log || [];
              const conversationData = {
                conversation_id: conversationId,
                full_chat_log: messages,
                started_at: data.started_at || new Date().toISOString(),
                completed_at: data.completed_at
              };
              
              setConversationData(conversationData);
              setShowHistoryModal(true);
              return;
            } else {
              console.error('채팅 데이터 로드 실패:', response.status);
            }
          }
        } catch (error) {
          console.error('채팅 데이터 로드 실패:', error);
        }
      }
      
      // conversationId가 없거나 API 호출 실패 시 기본 데이터로 모달 표시
      console.log('기본 데이터로 모달 표시');
      setConversationData({
        conversation_id: conversationId || 'default',
        full_chat_log: [
          {
            chat_id: 1,
            sender_role: 'dasida',
            message: '안녕! 유형체크 N제 중학 수학 1-1 문제집으로 수학 공부하러 왔구나! 정말 대단해! 이 문제 같이 해결해볼까?',
            message_type: 'text',
            created_at: new Date().toISOString()
          },
          {
            chat_id: 2,
            sender_role: 'user',
            message: '네, 도와주세요!',
            message_type: 'text',
            created_at: new Date().toISOString()
          },
          {
            chat_id: 3,
            sender_role: 'dasida',
            message: 'Q 1단계: 문제 이해하기\n\n이 문제에서 우리가 어떤 정보를 가지고 있고, 무엇을 구해야 하는지 먼저 파악해 볼까? 문제에서 주어진 정보와 구해야 하는 것은 무엇일까?',
            message_type: 'text',
            created_at: new Date().toISOString()
          }
        ],
        started_at: new Date().toISOString()
      });
      setShowHistoryModal(true);
    } catch (error) {
      console.error('질문 내역 다시보기 오류:', error);
      // 에러 발생 시에도 기본 데이터로 모달 표시
      setConversationData({
        conversation_id: 'error',
        full_chat_log: [
          {
            chat_id: 1,
            sender_role: 'dasida',
            message: '안녕! 유형체크 N제 중학 수학 1-1 문제집으로 수학 공부하러 왔구나! 정말 대단해! 이 문제 같이 해결해볼까?',
            message_type: 'text',
            created_at: new Date().toISOString()
          },
          {
            chat_id: 2,
            sender_role: 'user',
            message: '네, 도와주세요!',
            message_type: 'text',
            created_at: new Date().toISOString()
          },
          {
            chat_id: 3,
            sender_role: 'dasida',
            message: 'Q 1단계: 문제 이해하기\n\n이 문제에서 우리가 어떤 정보를 가지고 있고, 무엇을 구해야 하는지 먼저 파악해 볼까? 문제에서 주어진 정보와 구해야 하는 것은 무엇일까?',
            message_type: 'text',
            created_at: new Date().toISOString()
          }
        ],
        started_at: new Date().toISOString()
      });
      setShowHistoryModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRedo = () => {
    // 앞으로가기
    console.log('앞으로가기');
  };

  const handleEraser = () => {
    // 지우개
    console.log('지우개');
  };

  const handlePen = (penNumber: number) => {
    // 펜 도구
    console.log(`펜 ${penNumber}`);
  };

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
  };

  // 현재 탭이 활성화된 탭인지 확인하는 함수
  const isActiveTab = (tabName: string) => {
    return showPopup && activeTab === tabName;
  };

  // 필기 히스토리 저장 함수
  const saveToHistory = (newStrokes: any[]) => {
    const newHistory = drawingHistory.slice(0, historyIndex + 1);
    newHistory.push([...newStrokes]);
    setDrawingHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // 필기 히스토리에서 복원하는 함수
  const restoreFromHistory = (index: number) => {
    if (index >= 0 && index < drawingHistory.length) {
      setStrokes([...drawingHistory[index]]);
      setHistoryIndex(index);
    }
  };

  // 툴바 버튼 핸들러들
  const handleToolSelection = (tool: 'black' | 'red' | 'blue' | 'highlight' | 'erase') => {
    // 읽기 모드에서는 도구 선택을 무시
    if (!isToolbarVisible) {
      console.log('읽기 모드 - 도구 선택이 무시됩니다. 쓰기 모드로 전환하세요.');
      return;
    }
    
    console.log(`${tool} 도구 선택`);
    setSelectedTool(tool);
  };

  const handleTemporaryAction = (action: 'back' | 'front') => {
    // 읽기 모드에서는 액션을 무시
    if (!isToolbarVisible) {
      console.log('읽기 모드 - 액션이 무시됩니다. 쓰기 모드로 전환하세요.');
      return;
    }
    
    console.log(`${action} 액션 실행`);
    setTemporaryActiveTool(action);
    
    if (action === 'back') {
      // 이전 필기 상태로 되돌리기 (undo)
      if (historyIndex > 0) {
        restoreFromHistory(historyIndex - 1);
        console.log('이전 필기 상태로 되돌림');
      } else {
        console.log('더 이상 되돌릴 수 없음');
      }
    } else if (action === 'front') {
      // 다음 필기 상태로 진행 (redo)
      if (historyIndex < drawingHistory.length - 1) {
        restoreFromHistory(historyIndex + 1);
        console.log('다음 필기 상태로 진행');
      } else {
        console.log('더 이상 진행할 수 없음');
      }
    }
    
    // 2초 후 일시적 활성화 해제
    setTimeout(() => {
      setTemporaryActiveTool(null);
    }, 300);
  };

  // 손가락 터치와 펜 터치 구분 함수
  const isPenTouch = (event: any) => {
    const { touches, force, pressure } = event.nativeEvent;
    
    // 터치 포인트가 1개인지 확인
    if (touches && touches.length !== 1) {
      return false;
    }
    
    // force나 pressure가 있으면 펜으로 인식
    if (force && force > 0) {
      return true;
    }
    if (pressure && pressure > 0) {
      return true;
    }
    
    // 터치 시간 간격으로 구분 (손가락은 보통 빠른 연속 터치)
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTime;
    
    // 터치 간격이 너무 짧으면 손가락으로 판단
    if (timeDiff < 50) {
      return false;
    }
    
    // 터치 지속 시간으로 구분 (펜은 보통 더 오래 누름)
    const touchDuration = currentTime - touchStartTime;
    if (touchDuration > 100) {
      return true;
    }
    
    return false;
  };

  // 필기 기능 핸들러들
  const handleTouchStart = (event: any) => {
    // 읽기 모드에서는 필기하지 않음
    if (!isToolbarVisible) {
      console.log('읽기 모드 - 필기하지 않음');
      return;
    }
    
    const { locationX, locationY, force, pressure } = event.nativeEvent;
    const currentTime = Date.now();
    
    setTouchStartTime(currentTime);
    
    // 펜 터치인지 확인
    if (!isPenTouch(event)) {
      console.log('손가락 터치 감지 - 필기하지 않음');
      return;
    }
    
    console.log('펜 터치 감지 - 필기 시작');
    setIsDrawing(true);
    setLastTouchTime(currentTime);
    
    // 터치 이벤트 전파 방지
    event.preventDefault();
    event.stopPropagation();
    
    if (selectedTool === 'erase') {
      // 지우개 모드: 터치한 위치의 필기를 지움
      eraseAtPoint(locationX, locationY);
      return;
    }
    
    // 압력 감지 (force 또는 pressure 사용)
    const detectedPressure = force || pressure || 1;
    setStrokePressure(detectedPressure);
    
    const newPoint = {
      x: locationX,
      y: locationY,
      tool: selectedTool,
      timestamp: currentTime,
      pressure: detectedPressure,
      velocity: 0
    };
    
    setCurrentStroke([newPoint]);
    setLastPoint(newPoint);
  };

  const handleTouchMove = (event: any) => {
    if (!isDrawing) return;
    
    const { locationX, locationY, force, pressure } = event.nativeEvent;
    const currentTime = Date.now();
    
    // 터치 이벤트 전파 방지
    event.preventDefault();
    event.stopPropagation();
    
    if (selectedTool === 'erase') {
      // 지우개 모드: 이동하면서 지움
      eraseAtPoint(locationX, locationY);
      return;
    }
    
    // 압력 감지
    const detectedPressure = force || pressure || strokePressure;
    
    // 속도 계산
    let velocity = 0;
    if (lastPoint) {
      const distance = Math.sqrt(
        Math.pow(locationX - lastPoint.x, 2) + Math.pow(locationY - lastPoint.y, 2)
      );
      const timeDiff = currentTime - lastPoint.timestamp;
      velocity = timeDiff > 0 ? distance / timeDiff : 0;
    }
    
    const newPoint = {
      x: locationX,
      y: locationY,
      tool: selectedTool,
      timestamp: currentTime,
      pressure: detectedPressure,
      velocity: velocity
    };
    
    // 이전 점과의 거리 계산 (동적 임계값 적용)
    const prevPoint = currentStroke[currentStroke.length - 1];
    if (prevPoint) {
      const distance = Math.sqrt(
        Math.pow(newPoint.x - prevPoint.x, 2) + Math.pow(newPoint.y - prevPoint.y, 2)
      );
      
      // 속도와 압력에 따른 동적 임계값
      const dynamicThreshold = Math.max(0.5, 1 - velocity * 0.1) * (1 + detectedPressure * 0.1);
      
      if (distance > dynamicThreshold) {
        setCurrentStroke(prev => [...prev, newPoint]);
        setLastPoint(newPoint);
        setStrokeVelocity(velocity);
        setStrokePressure(detectedPressure);
      }
    } else {
      setCurrentStroke(prev => [...prev, newPoint]);
      setLastPoint(newPoint);
    }
  };

  const handleTouchEnd = (event: any) => {
    if (!isDrawing) return;
    
    console.log('터치 종료');
    
    // 터치 이벤트 전파 방지
    event.preventDefault();
    event.stopPropagation();
    
    if (selectedTool !== 'erase' && currentStroke.length > 0) {
      // 부드러운 곡선을 위해 베지어 곡선 적용
      const smoothedStroke = smoothStroke(currentStroke);
      const newStrokes = [...strokes, smoothedStroke];
      setStrokes(newStrokes);
      // 히스토리에 저장
      saveToHistory(newStrokes);
    }
    setCurrentStroke([]);
    setIsDrawing(false);
  };

  // 고도화된 자연스러운 선 그리기 알고리즘
  const smoothStroke = (points: any[]) => {
    if (points.length < 2) return points;
    if (points.length === 2) return points;
    
    const smoothed = [points[0]];
    
    // 다중 스플라인 조합으로 더 자연스러운 곡선
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i === 0 ? points[0] : points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i === points.length - 2 ? points[i + 1] : points[i + 2];
      
      // 속도에 따른 동적 스텝 조정
      const velocity = calculateVelocity(p1, p2);
      const steps = Math.max(4, Math.min(12, Math.floor(8 + velocity * 4)));
      
      for (let t = 0; t <= 1; t += 1 / steps) {
        // Catmull-Rom과 베지어 곡선의 가중 평균
        const catmullX = catmullRomSpline(p0.x, p1.x, p2.x, p3.x, t);
        const catmullY = catmullRomSpline(p0.y, p1.y, p2.y, p3.y, t);
        
        const bezierX = quadraticBezier(p1.x, p2.x, t);
        const bezierY = quadraticBezier(p1.y, p2.y, t);
        
        // 속도에 따른 가중치 조정
        const weight = Math.min(0.7, velocity * 0.3);
        const x = catmullX * (1 - weight) + bezierX * weight;
        const y = catmullY * (1 - weight) + bezierY * weight;
        
        smoothed.push({
          x,
          y,
          tool: p1.tool,
          timestamp: p1.timestamp,
          pressure: p1.pressure || 1,
          velocity: velocity
        });
      }
    }
    
    // 마지막 점 추가
    smoothed.push(points[points.length - 1]);
    
    // 고급 중복 제거 (압력과 속도 고려)
    return removeDuplicatePointsAdvanced(smoothed);
  };

  // 속도 계산 함수
  const calculateVelocity = (point1: any, point2: any) => {
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
    );
    const timeDiff = (point2.timestamp - point1.timestamp) || 1;
    return Math.min(distance / timeDiff, 10); // 최대 속도 제한
  };

  // 이차 베지어 곡선
  const quadraticBezier = (p0: number, p1: number, t: number) => {
    return (1 - t) * p0 + t * p1;
  };

  // Catmull-Rom 스플라인 계산 함수
  const catmullRomSpline = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  };

  // 고급 중복 제거 함수 (압력과 속도 고려)
  const removeDuplicatePointsAdvanced = (points: any[]) => {
    const baseThreshold = 0.3; // 기본 최소 거리 임계값
    const filtered = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prev = filtered[filtered.length - 1];
      const curr = points[i];
      
      const distance = Math.sqrt(
        Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
      );
      
      // 속도와 압력에 따른 동적 임계값 조정
      const velocity = curr.velocity || 1;
      const pressure = curr.pressure || 1;
      const dynamicThreshold = baseThreshold * (1 + velocity * 0.1) * (1 + pressure * 0.2);
      
      if (distance > dynamicThreshold) {
        filtered.push(curr);
      }
    }
    
    return filtered;
  };

  // 기존 중복 제거 함수 (호환성 유지)
  const removeDuplicatePoints = (points: any[]) => {
    return removeDuplicatePointsAdvanced(points);
  };

  // 지우개 기능: 특정 위치의 필기를 지움
  const eraseAtPoint = (x: number, y: number) => {
    const eraseRadius = 20; // 지우개 반경
    
    setStrokes(prevStrokes => {
      const newStrokes = prevStrokes.map(stroke => {
        // 각 stroke에서 eraseRadius 내의 점들을 제거
        const filteredStroke = stroke.filter(point => {
          const distance = Math.sqrt(
            Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2)
          );
          return distance > eraseRadius;
        });
        
        // 점이 너무 적으면 전체 stroke 제거
        return filteredStroke.length > 1 ? filteredStroke : null;
      }).filter(stroke => stroke !== null);
      
      // 히스토리에 저장
      saveToHistory(newStrokes);
      return newStrokes;
    });
  };

  const clearCanvas = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  // 도구별 색상 반환 함수
  const getToolColor = (tool: string) => {
    switch (tool) {
      case 'black': return '#000000';
      case 'red': return '#FF0000';
      case 'blue': return '#0000FF';
      case 'highlight': return '#FFFF00';
      default: return '#000000';
    }
  };

  // 도구별 두께 반환 함수 (압력과 속도 고려)
  const getToolWidth = (tool: string, pressure: number = 1, velocity: number = 1) => {
    const baseWidth = (() => {
      switch (tool) {
        case 'black': return 2;
        case 'red': return 2;
        case 'blue': return 2;
        case 'highlight': return 8;
        default: return 2;
      }
    })();
    
    // 압력에 따른 두께 조정 (0.5 ~ 2배)
    const pressureMultiplier = Math.max(0.5, Math.min(2, pressure));
    
    // 속도에 따른 두께 조정 (빠를수록 얇게)
    const velocityMultiplier = Math.max(0.7, Math.min(1.3, 1 - velocity * 0.05));
    
    return Math.max(1, baseWidth * pressureMultiplier * velocityMultiplier);
  };

  // 마크다운 텍스트 렌더링 함수
  const renderMarkdownText = (text: string, textStyle: any) => {
    if (!text) return null;
    
    // **텍스트** 패턴을 찾아서 볼드 처리
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    
    return (
      <ThemedText>
        {parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const content = part.slice(2, -2);
            return (
              <ThemedText key={index} style={[textStyle, { fontWeight: 'bold' }]}>
                {content}
              </ThemedText>
            );
          }
          return (
            <ThemedText key={index} style={textStyle}>
              {part}
            </ThemedText>
          );
        })}
      </ThemedText>
    );
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
        <ThemedText style={styles.headerTitle}>
          {'체크체크 유형체크 N제 1-1'}, {page || '117'}p. {number || '812'}번
        </ThemedText>
        <ThemedView style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerActionButton} 
            onPress={handleSave}
            activeOpacity={0.6}
            onPressIn={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPressOut={(e) => e.stopPropagation()}
          >
            <Image source={require('@/assets/images/cloud.png')} style={styles.headerIcon} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerActionButton} 
            onPress={handleUndo}
            activeOpacity={0.6}
            onPressIn={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPressOut={(e) => e.stopPropagation()}
          >
            <Image source={require('@/assets/images/chat_log.png')} style={styles.headerIcon} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerActionButton} 
            onPress={handleViewMode}
            activeOpacity={0.6}
            onPressIn={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPressOut={(e) => e.stopPropagation()}
          >
            <Image 
              source={
                isToolbarVisible 
                  ? require('@/assets/images/write_default.png')
                  : require('@/assets/images/eye_default.png')
              } 
              style={styles.headerIcon} 
            />
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* Tool Bar */}
      <View style={{ overflow: 'hidden', height: isToolbarVisible ? 55 : 0 }}>
        <Animated.View 
          style={[
            styles.toolbar,
            {
              opacity: toolbarAnimation,
              transform: [
                {
                  translateY: toolbarAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-55, 0],
                  }),
                },
              ],
            },
          ]}
        >
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            selectedTool === 'black' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleToolSelection('black')}
        >
          <Image source={require('@/assets/images/black.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            selectedTool === 'red' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleToolSelection('red')}
        >
          <Image source={require('@/assets/images/red.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            selectedTool === 'blue' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleToolSelection('blue')}
        >
          <Image source={require('@/assets/images/blue.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            selectedTool === 'highlight' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleToolSelection('highlight')}
        >
          <Image source={require('@/assets/images/highlight.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            selectedTool === 'erase' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleToolSelection('erase')}
        >
          <Image source={require('@/assets/images/erase.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            temporaryActiveTool === 'back' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleTemporaryAction('back')}
        >
          <Image source={require('@/assets/images/back.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.toolButton, 
            temporaryActiveTool === 'front' ? styles.activeTool : null,
            !isToolbarVisible ? styles.disabledTool : null
          ]}
          onPress={() => handleTemporaryAction('front')}
        >
          <Image source={require('@/assets/images/front.png')} style={[
            styles.toolIcon,
            !isToolbarVisible ? styles.disabledToolIcon : null
          ]} />
        </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        scrollEnabled={!isDrawing}
      >
        {/* Dasida Hint */}
        {loadingReport ? (
          <ThemedView style={styles.hintSection}>
            <ThemedView style={styles.hintContent}>
              <Image source={require('@/assets/images/tip.png')} style={styles.tipIcon} />
              <ThemedText style={styles.hintText}>
                리포트를 불러오는 중입니다...
              </ThemedText>
            </ThemedView>
          </ThemedView>
        ) : reportData.hasData && reportData.dasidaHint ? (
          <ThemedView style={styles.hintSection}>
            <ThemedView style={styles.hintContent}>
              <Image source={require('@/assets/images/tip.png')} style={styles.tipIcon} />
              <ThemedView style={styles.hintTextContainer}>
                {renderMarkdownText(reportData.dasidaHint, styles.hintText)}
              </ThemedView>
            </ThemedView>
          </ThemedView>
        ) : (
          <ThemedView style={styles.hintSection}>
            <ThemedView style={styles.hintContent}>
              <Image source={require('@/assets/images/tip.png')} style={styles.tipIcon} />
              <ThemedText style={styles.hintText}>
                아직 생성된 리포트 데이터가 없습니다.
              </ThemedText>
            </ThemedView>
          </ThemedView>
        )}

        {/* Problem Section */}
        <ThemedView style={styles.problemSection}>
          <ThemedView style={styles.problemContainer}>
            <ThemedView style={styles.problemImageContainer}>
              <Image
                source={{ uri: `http://52.79.233.106:80/uploads/problem_img/checkN_${number?.padStart(4, '0') || '0812'}.png` }}
                style={[
                  styles.problemImage,
                  problemImageDimensions && {
                    width: problemImageDimensions.width,
                    height: problemImageDimensions.height
                  }
                ]}
                resizeMode="contain"
                onError={() => {
                  console.log('문제 이미지 로드 실패');
                }}
              />
            </ThemedView>
          </ThemedView>
        </ThemedView>

        {/* Writing Canvas Section */}
        <ThemedView style={styles.writingCanvasSection}>
          <ThemedView style={styles.canvasHeader}>
            <ThemedText style={styles.canvasTitle}>자유롭게 필기 해보세요.</ThemedText>
          </ThemedView>
          
          {/* Grid Lines for Writing */}
          <ThemedView 
            style={styles.unifiedCanvasContainer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            pointerEvents={isToolbarVisible ? 'auto' : 'none'}
          >
            {/* Grid lines */}
            {Array.from({ length: 100 }).map((_, index) => (
              <ThemedView 
                key={index} 
                style={[
                  styles.gridLine, 
                  { top: (index + 1) * 45 }
                ]} 
              />
            ))}
            
            {/* Rendered strokes */}
            {strokes.map((stroke, strokeIndex) => (
              <View key={strokeIndex} style={styles.strokeContainer}>
                {stroke.map((point: any, pointIndex: number) => {
                  if (pointIndex === 0) return null;
                  const prevPoint = stroke[pointIndex - 1];
                  const color = getToolColor(point.tool);
                  const width = getToolWidth(point.tool, point.pressure, point.velocity);
                  
                  const distance = Math.sqrt(
                    Math.pow(point.x - prevPoint.x, 2) + 
                    Math.pow(point.y - prevPoint.y, 2)
                  );
                  
                  // 너무 짧은 선분은 렌더링하지 않음 (성능 최적화)
                  if (distance < 0.5) return null;
                  
                  return (
                    <View
                      key={pointIndex}
                      style={[
                        styles.strokeLine,
                        {
                          left: prevPoint.x,
                          top: prevPoint.y,
                          width: distance,
                          backgroundColor: color,
                          height: width,
                          transform: [
                            {
                              rotate: `${Math.atan2(
                                point.y - prevPoint.y,
                                point.x - prevPoint.x
                              )}rad`
                            }
                          ]
                        }
                      ]}
                    />
                  );
                })}
              </View>
            ))}
            
            {/* Current stroke being drawn */}
            {currentStroke.length > 1 && selectedTool !== 'erase' && (
              <View style={styles.strokeContainer}>
                {currentStroke.map((point: any, pointIndex: number) => {
                  if (pointIndex === 0) return null;
                  const prevPoint = currentStroke[pointIndex - 1];
                  const color = getToolColor(point.tool);
                  const width = getToolWidth(point.tool, point.pressure, point.velocity);
                  
                  const distance = Math.sqrt(
                    Math.pow(point.x - prevPoint.x, 2) + 
                    Math.pow(point.y - prevPoint.y, 2)
                  );
                  
                  // 너무 짧은 선분은 렌더링하지 않음 (성능 최적화)
                  if (distance < 0.5) return null;
                  
                  return (
                    <View
                      key={pointIndex}
                      style={[
                        styles.strokeLine,
                        {
                          left: prevPoint.x,
                          top: prevPoint.y,
                          width: distance,
                          backgroundColor: color,
                          height: width,
                          transform: [
                            {
                              rotate: `${Math.atan2(
                                point.y - prevPoint.y,
                                point.x - prevPoint.x
                              )}rad`
                            }
                          ]
                        }
                      ]}
                    />
                  );
                })}
              </View>
            )}
            
            {/* Eraser cursor */}
            {selectedTool === 'erase' && (
              <View style={styles.eraserCursor}>
                <View style={styles.eraserCircle} />
              </View>
            )}
          </ThemedView>
        </ThemedView>
      </ScrollView>

      {/* Popup Section - Positioned above tab bar */}
      {showPopup && (
        <ThemedView style={styles.popupSection}>
          {activeTab === '오답 원인 분석' && (
            <ThemedView style={styles.errorAnalysisSection}>
              <ThemedView style={styles.errorAnalysisHeader}>
                <ThemedText style={styles.errorAnalysisTitle}>오답 이유</ThemedText>
                <TouchableOpacity style={styles.closeButton} onPress={handleClosePopup}>
                  
                  <Image source={require('@/assets/images/close.png')} 
                  style={styles.closeButtonIcon} 
                  />
                </TouchableOpacity>
              </ThemedView>
              <ScrollView style={styles.errorAnalysisContent} showsVerticalScrollIndicator={false}>
                {loadingReport ? (
                  <ThemedText style={styles.errorAnalysisText}>
                    리포트를 불러오는 중입니다...
                  </ThemedText>
                ) : reportData.hasData && reportData.errorAnalysis ? (
                  <ThemedText style={styles.errorAnalysisText}>
                    {renderMarkdownText(reportData.errorAnalysis, styles.errorAnalysisText)}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.errorAnalysisText}>
                    아직 생성된 오답 원인 분석 데이터가 없습니다.
                  </ThemedText>
                )}
              </ScrollView>
            </ThemedView>
          )}

          {activeTab === '올바른 풀이' && (
            <ThemedView style={styles.correctSolutionSection}>
              <ThemedView style={styles.correctSolutionHeader}>
                <ThemedText style={styles.correctSolutionTitle} lightColor="#000000">올바른 풀이</ThemedText>
                <TouchableOpacity style={styles.closeButton} onPress={handleClosePopup}>
                  <Image source={require('@/assets/images/close.png')} 
                  style={styles.closeButtonIcon} 
                  />
                </TouchableOpacity>
              </ThemedView>
              <ScrollView style={styles.correctSolutionContent} showsVerticalScrollIndicator={false}>
                {loadingReport ? (
                  <ThemedText style={styles.correctSolutionText}>
                    리포트를 불러오는 중입니다...
                  </ThemedText>
                ) : reportData.hasData && reportData.correctSolution ? (
                  <ThemedView>
                    <ThemedText style={styles.correctSolutionText}>
                      {renderMarkdownText(reportData.correctSolution, styles.correctSolutionText)}
                    </ThemedText>
                    {reportData.keyConcept && (
                      <ThemedView style={styles.keyConceptSection}>
                        <ThemedText style={styles.keyConceptTitle}>핵심 개념</ThemedText>
                        <ThemedText style={styles.keyConceptText}>
                          {renderMarkdownText(reportData.keyConcept, styles.keyConceptText)}
                        </ThemedText>
                      </ThemedView>
                    )}
                  </ThemedView>
                ) : (
                  <ThemedText style={styles.correctSolutionText}>
                    아직 생성된 올바른 풀이 데이터가 없습니다.
                  </ThemedText>
                )}
              </ScrollView>
            </ThemedView>
          )}

          {activeTab === '유사 문제 풀기' && (
            <ThemedView style={styles.similarProblemSection}>
              <ThemedView style={styles.similarProblemHeader}>
                <ThemedText style={styles.similarProblemTitle} lightColor="#000000">유사 문제</ThemedText>
                <TouchableOpacity style={styles.closeButton} onPress={handleClosePopup}>
                  <Image source={require('@/assets/images/close.png')} 
                  style={styles.closeButtonIcon} 
                  />
                </TouchableOpacity>
              </ThemedView>
              <ScrollView style={styles.similarProblemContent} showsVerticalScrollIndicator={false}>
                {loadingSimilarProblem ? (
                  <ThemedView style={styles.loadingContainer}>
                    <ThemedText style={styles.loadingText}>유사문제를 불러오는 중입니다...</ThemedText>
                  </ThemedView>
                ) : similarProblemData ? (
                  <ThemedView style={styles.similarProblemCard}>
                    <ThemedView style={styles.similarProblemInfo}>
                      <ThemedText style={styles.similarProblemBookName}>
                        {similarProblemData.p_name} {similarProblemData.p_page}p. {similarProblemData.num_in_page}번
                      </ThemedText>
                    </ThemedView>
                    
                    <ThemedView style={styles.similarProblemDetails}>
                      <ThemedText style={styles.similarProblemChapter}>
                        {similarProblemData.main_chapt} - {similarProblemData.sub_chapt}
                      </ThemedText>
                      <ThemedText style={styles.similarProblemType}>
                        {similarProblemData.con_type} ({similarProblemData.p_level})
                      </ThemedText>
                      
                    </ThemedView>
                    <ThemedView style={styles.similarProblemImageContainer}>
                      <Image
                        source={{ uri: `http://52.79.233.106/fastapi${similarProblemData.p_img_url}` }}
                        style={styles.similarProblemImage}
                        resizeMode="contain"
                        onError={() => {
                          console.log('유사문제 이미지 로드 실패');
                        }}
                      />
                    </ThemedView>
                    
                  </ThemedView>
                ) : (
                  <ThemedView style={styles.noDataContainer}>
                    <ThemedText style={styles.noDataText}>
                      해당 문제의 유사문제는 추후 지원 예정입니다.{'\n'}기대해주세요!
                    </ThemedText>
                  </ThemedView>
                )}
              </ScrollView>
            </ThemedView>
          )}
        </ThemedView>
      )}

      {/* Bottom Tab Bar */}
      <ThemedView style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={[styles.tabButton, isActiveTab('오답 원인 분석') && styles.activeTabButton]}
          onPress={() => handleTabChange('오답 원인 분석')}
        >
          <ThemedText style={[
            styles.tabText, 
            isActiveTab('오답 원인 분석') ? styles.activeTabText : (showPopup ? styles.inactiveTabText : null)
          ]}>
            오답 원인 분석
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, isActiveTab('올바른 풀이') && styles.activeTabButton]}
          onPress={() => handleTabChange('올바른 풀이')}
        >
          <ThemedText style={[
            styles.tabText, 
            isActiveTab('올바른 풀이') ? styles.activeTabText : (showPopup ? styles.inactiveTabText : null)
          ]}>
            올바른 풀이
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, isActiveTab('유사 문제 풀기') && styles.activeTabButton]}
          onPress={() => handleTabChange('유사 문제 풀기')}
        >
          <ThemedText style={[
            styles.tabText, 
            isActiveTab('유사 문제 풀기') ? styles.activeTabText : (showPopup ? styles.inactiveTabText : null)
          ]}>
            유사 문제 풀기
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* History Modal */}
      {showHistoryModal && (
        <Modal
          visible={showHistoryModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <ThemedView style={styles.modalOverlay}>
            <ThemedView style={styles.modalContent}>
              <ThemedView style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>질문 내용 다시 보기</ThemedText>
                <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowHistoryModal(false)}>
                  <Image source={require('@/assets/images/close.png')} 
                  style={styles.closeButtonIcon} 
                  />
                </TouchableOpacity>
              </ThemedView>
              {loading ? (
                <ThemedView style={styles.loadingContainer}>
                  <ThemedText style={styles.loadingText}>데이터를 불러오는 중입니다...</ThemedText>
                </ThemedView>
              ) : conversationData ? (
                <ScrollView style={styles.chatLogContainer} showsVerticalScrollIndicator={false}>
                  {/* 실제 채팅 메시지들 */}
                  {conversationData.full_chat_log && conversationData.full_chat_log.length > 0 ? (
                    conversationData.full_chat_log.map((message, index) => (
                      <ThemedView key={`${message.chat_id}-${index}`} style={[
                        styles.messageContainer,
                        message.sender_role === 'user' ? styles.userMessage : styles.botMessage
                      ]}>
                        {message.sender_role === 'dasida' && (
                          <ThemedView style={styles.botMessageWrapper}>
                            <ThemedView style={styles.messageAvatar}>
                              <Image 
                                source={require('@/assets/images/maesaen0.8.png')} 
                                style={styles.messageAvatarImage}
                              />
                            </ThemedView>
                            <ThemedView style={styles.botMessageContent}>
                              <ThemedText style={styles.botName}>매쓰천재</ThemedText>
                              <ThemedView style={[
                                styles.messageBubble,
                                styles.botBubble
                              ]}>
                                <ThemedText style={styles.botText}>
                                  {removeMetadataFromMessage(message.message)}
                                </ThemedText>
                              </ThemedView>
                            </ThemedView>
                          </ThemedView>
                        )}
                        {message.sender_role === 'user' && (
                          <ThemedView style={[
                            styles.messageBubble,
                            styles.userBubble
                          ]}>
                            <ThemedText style={styles.userText}>
                              {removeMetadataFromMessage(message.message)}
                            </ThemedText>
                          </ThemedView>
                        )}
                      </ThemedView>
                    ))
                  ) : (
                    <ThemedView style={styles.emptyChatContainer}>
                      <ThemedText style={styles.emptyChatText}>채팅 내역이 없습니다.</ThemedText>
                    </ThemedView>
                  )}
                </ScrollView>
              ) : (
                <ThemedView style={styles.noDataContainer}>
                  <ThemedText style={styles.noDataText}>데이터가 없습니다.</ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          </ThemedView>
        </Modal>
      )}
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
    justifyContent: 'flex-start',
    paddingHorizontal: -80,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  closeButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  backButton: {
    padding: 0,
    marginLeft: -50,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '400',
    color: '#1D1B20',
    textAlign: 'left',
    marginLeft: -70,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  headerActionButton: {
    width: 60,
    height: 60,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 4,
  },
  headerIcon: {
    height: 48,
    resizeMode: 'contain',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FBFBFB',
    height: 55,
  },
  toolButton: {
    padding: 8,
    marginRight: 8,
    borderRadius: 24,
  },
  activeTool: {
    backgroundColor: '#F0F0F0',
  },
  disabledTool: {
    opacity: 0.3,
  },
  toolIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  disabledToolIcon: {
    opacity: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentContainer: {
    paddingBottom: 800, // Much more space for infinite scrolling
    minHeight: 1200, // Ensure minimum height for scrolling
  },
  hintSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  hintContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3861DA',
    borderRadius:50,
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 10,
  },
  hintTextContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  hintText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#fff',
    lineHeight: 27,
  },
  tipIcon: {
    width: 25,
    height: 25,
    resizeMode: 'contain',
  },
  problemSection: {
    marginBottom: 16,
  },
  problemContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 20,
    padding: 16,
  },
  problemRange: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3861DA',
    marginBottom: 8,
  },
  problemText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#333',
    lineHeight: 24,
    marginBottom: 16,
  },
  problemImageContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  problemImage: {
    borderRadius: 8,
    backgroundColor: '#fff',
    resizeMode: 'contain',
  },
  errorAnalysisSection: {
    backgroundColor: '#E8F0F9',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  errorAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#E8F0F9',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorAnalysisTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  errorAnalysisContent: {
    maxHeight: 300,
  },
  errorAnalysisText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#000',
    lineHeight: 27,
  },
  errorNumber: {
    fontWeight: '600',
    color: '#333',
  },
  errorHighlight: {
    color: '#FF6B35',
    fontWeight: '500',
  },
  bottomTabBar: {
    position: 'absolute',
    width: 772,
    height: 60,
    left: '50%',
    marginLeft: -386, // 772/2 = 386
    bottom: 0,
    backgroundColor: '#F5F5F5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 23,
    marginHorizontal: 4,
  },
  activeTabButton: {
    backgroundColor: '#3861DA',
  },
  tabText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#3861DA',
    textAlign: 'center',
  },
  inactiveTabText: {
    color: '#A8A8A9',
  },
  activeTabText: {
    color: '#fff',
  },
  // Popup Styles
  popupSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'E8F0F9',
    marginBottom: 50,
  },
  // Correct Solution Styles
  correctSolutionSection: {
    backgroundColor: '#E8F0F9',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  correctSolutionHeader: {
    flexDirection: 'row',
    backgroundColor: '#E8F0F9',
    justifyContent: 'space-between',

    alignItems: 'center',
    marginBottom: 16,
  },
  correctSolutionTitle: {
    backgroundColor: '#E8F0F9',
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  correctSolutionContent: {
    backgroundColor: '#E8F0F9',
    maxHeight: 300,
  },
  correctSolutionText: {
    backgroundColor: '#E8F0F9',
    fontSize: 16,
    fontWeight: '400',
    color: '#333',
    lineHeight: 24,
  },
  keyConceptSection: {
    backgroundColor: '#E8F0F9',
    marginTop: 0,
    paddingTop: 16,
  },
  keyConceptTitle: {
    backgroundColor: '#E8F0F9',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  keyConceptText: {
    backgroundColor: '#E8F0F9',
    fontSize: 16,
    fontWeight: '400',
    // color: '#333',
    lineHeight: 24,
  },
  solutionStep: {
    backgroundColor: '#E8F0F9',
    fontWeight: '600',
    color: '#4CAF50',
  },
  // Similar Problem Styles
  similarProblemSection: {
    backgroundColor: '#E8F0F9',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  similarProblemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#E8F0F9',
    alignItems: 'center',
    marginBottom: 16,
  },
  similarProblemTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  similarProblemContent: {
    maxHeight: 400,
  },
  similarProblemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  similarProblemNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9800',
    marginBottom: 8,
  },
  similarProblemText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  similarProblemInfo: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  similarProblemBookName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3861DA',
    marginBottom: 4,
  },
  similarProblemImageContainer: {
    height: 300,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  similarProblemImage: {
    width: '100%',
    height: '100%',
  },
  similarProblemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  similarProblemChapter: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginRight: 8,
  },
  similarProblemType: {
    fontSize: 12,
    color: '#666',
  },
  // Writing Canvas Styles
  writingCanvasSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  canvasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  canvasTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ccc',
  },
  canvasContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    minHeight: 400,
    position: 'relative',
  },
  unifiedCanvasContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 16,
    minHeight: 2500, // 훨씬 큰 필기 공간
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 1,
    // backgroundColor: '#F0F0F0',
    backgroundColor: '#c7c5c5',
    top: 0,
  },
  writingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  writingHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  strokeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  strokeLine: {
    position: 'absolute',
    borderRadius: 1,
  },
  eraserCursor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eraserCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FF0000',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
  },
  additionalSpace: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  additionalSpaceText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  additionalWritingArea: {
    marginTop: 16,
    marginBottom: 16,
  },
  finalSpace: {
    paddingVertical: 60,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  finalSpaceText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 38,
    overflow: 'hidden',
    height: 660,
  },
  modalHeader: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
    paddingVertical: 25,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    right: 25,
    top: 25,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatLogContainer: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 15,
    marginVertical: 8,
    maxWidth: '80%',
  },
  dasidaBubble: {
    backgroundColor: '#E0E0E0',
    alignSelf: 'flex-start',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
  },
  userBubble: {
    backgroundColor: '#3861DA',
    alignSelf: 'flex-end',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  noDataContainer: {
    flex: 1,
    backgroundColor: '#E8F0F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 20,
    color: '#666',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 40,
  },
  // AI Message Styles
  aiMessageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aiAvatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  aiMessageBubble: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 15,
    padding: 12,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
  },
  aiMessageText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  // Problem Step Styles
  problemStepContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3861DA',
    marginLeft: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
  },
  optionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  selectedOptionButton: {
    backgroundColor: '#3861DA',
    borderWidth: 1,
    borderColor: '#3861DA',
    borderRadius: 8,
    padding: 12,
  },
  selectedOptionText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  // Chat Message Styles
  messageContainer: {
    marginBottom: 16,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
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
  emptyChatContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Chat Message Styles (from problem.tsx)
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  userMessage: {
    flexDirection: 'row-reverse',
  },
  botMessage: {
    flexDirection: 'row',
  },
  messageAvatar: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    marginRight: 10,
    marginTop: 5,
  },
  messageAvatarImage: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
  },
  messageAvatarText: {
    fontSize: 18,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
  },
  userBubble: {
    backgroundColor: '#3861DA',
    borderColor: '#3861DA',
    borderWidth: 1,
  },
  botBubble: {
    backgroundColor: '#F8F9FA',
    borderColor: '#E9ECEF',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#2C3E50',
  },
  userText: {
    color: '#ffffff',
  },
  botText: {
    color: '#2C3E50',
  },
  // Bot Message Layout Styles
  botMessageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  botMessageContent: {
    flex: 1,
    marginLeft: 10,
  },
  botName: {
    fontSize: 16,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
    marginLeft: 5,
  },
});


