import { StyleSheet, ScrollView, TouchableOpacity, View, Modal, TextInput, PanResponder, Image, Text, Dimensions, Animated, KeyboardAvoidingView, Platform, Keyboard, NativeModules, ActivityIndicator, LayoutAnimation, UIManager, InteractionManager } from 'react-native';
import { WebView } from 'react-native-webview';
import React, { useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import KaTeX from 'react-native-katex';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
// import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { processLatexInText, fixCommonLatexErrors } from '@/utils/latexProcessor';
import { getAccessToken } from '@/src/auth';

// 채팅 메시지 타입 정의
interface ChatMessage {
  id: number;
  type: 'user' | 'bot';
  message: string;
  avatar: string;
  problemInfo?: any;
  tokenUsage?: any;
  currentStep?: number;
  attempts?: Record<string, number>;
}

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

export default function ProblemScreen() {
  const router = useRouter();
  const colors = Colors.light;
  const [showChatbotModal, setShowChatbotModal] = useState(false);
  const [pageNumber, setPageNumber] = useState('');
  const [problemNumber, setProblemNumber] = useState('');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentProblemId, setCurrentProblemId] = useState<number | null>(null);

  // PDF 관련 상태
  const [pdfSource, setPdfSource] = useState('');
  
  // 오답노트 저장 모달 상태
  const [showIncorrectNotesModal, setShowIncorrectNotesModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'refresh' | 'close' | null>(null);
  const [currentProblemInfo, setCurrentProblemInfo] = useState<{page?: string, number?: string, bookName?: string} | null>(null);
  
  // 토스트 알림 상태
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // 챗봇 로딩 상태
  const [isChatbotLoading, setIsChatbotLoading] = useState(false);
  
  // 매쓰천재 연결 로딩 상태
  const [isConnectingToTutor, setIsConnectingToTutor] = useState(false);
  
  // 채팅 종료 확인 모달 상태
  const [showExitChatModal, setShowExitChatModal] = useState(false);
  
  // 타이핑 애니메이션
  const typingAnimation = useRef(new Animated.Value(0)).current;
  
  // 토스트 애니메이션
  const toastAnimation = useRef(new Animated.Value(0)).current;
  
  // 토스트 메시지 표시 함수
  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    
    // 토스트 나타나는 애니메이션
    Animated.timing(toastAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    // 3초 후 자동으로 사라지는 애니메이션
    setTimeout(() => {
      hideToastMessage();
    }, 3000);
  };
  
  // 토스트 메시지 숨김 함수
  const hideToastMessage = () => {
    Animated.timing(toastAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowToast(false);
    });
  };
  
  // 타이핑 애니메이션 효과
  React.useEffect(() => {
    if (isChatbotLoading) {
      const startTypingAnimation = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(typingAnimation, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(typingAnimation, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        ).start();
      };
      startTypingAnimation();
    } else {
      typingAnimation.setValue(0);
    }
  }, [isChatbotLoading]);
  
  // 헤더 버튼 호버 상태
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  
  // 버튼 호버 애니메이션 값
  const refreshButtonScale = useRef(new Animated.Value(1)).current;
  const closeButtonScale = useRef(new Animated.Value(1)).current;
  
  // 키보드 상태 관리
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // StatusBar 높이 관리
  const [statusBarHeight, setStatusBarHeight] = useState(0);
  
  // 각 버튼의 선택 상태
  const [isPlaySelected, setIsPlaySelected] = useState(false);
  const [isCloudSelected, setIsCloudSelected] = useState(false);
  const [isBookmarkSelected, setIsBookmarkSelected] = useState(false);
  const [isBookSelected, setIsBookSelected] = useState(false);
  const [isMaesaenSelected, setIsMaesaenSelected] = useState(false);
  const [isEyeSelected, setIsEyeSelected] = useState(false);
  
  // 툴바 표시 상태 - 초기값을 false로 변경 (읽기 모드)
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  
  // 툴바 애니메이션 값 - 초기값을 0으로 변경 (읽기 모드)
  const toolbarAnimation = useRef(new Animated.Value(0)).current;
  
  // 툴바 버튼 상태
  const [selectedTool, setSelectedTool] = useState<'black' | 'red' | 'blue' | 'highlight' | 'erase'>('black');
  const [temporaryActiveTool, setTemporaryActiveTool] = useState<'back' | 'front' | null>(null);
  
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
  const [isDrawingMode, setIsDrawingMode] = useState(false); // 필기 모드 토글
  
  // 화면 크기
  const { width, height } = Dimensions.get('window');
  const splitStartRef = useRef(0);
  const splitAreaHeightRef = useRef<number>(height);

  // 스크롤 자동화를 위한 ref
  const scrollViewRef = useRef<ScrollView>(null);

  const handleBack = () => {
    // 멀티 창 모드에서 채팅 중일 때 확인 모달 표시
    if (isSplitMode && chatMessages.length > 0) {
      setShowExitChatModal(true);
      return;
    }
    
    router.back();
  };

  const handleChatbotOpen = () => {
    setShowChatbotModal(true);
  };

  const handleChatbotClose = () => {
    setShowChatbotModal(false);
    setPageNumber('');
    setProblemNumber('');
  };

  // 채팅 종료 확인 - 나가기
  const handleExitChat = async () => {
    setShowExitChatModal(false);
    
    // 대화 세션 완료 처리
    if (currentConversationId) {
      try {
        const completeResponse = await fetch(`http://52.79.233.106/fastapi/conversation/${currentConversationId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (completeResponse.ok) {
          console.log('대화 세션 완료됨:', currentConversationId);
        } else {
          console.error('대화 세션 완료 실패:', completeResponse.status);
        }
      } catch (error) {
        console.error('대화 세션 완료 오류:', error);
      }
    }
    
    // 상태 초기화
    setIsSplitMode(false);
    setChatMessages([]);
    setCurrentConversationId(null);
    setCurrentUserId(null);
    setCurrentProblemId(null);
    setCurrentProblemInfo(null);
    
    // 뒤로가기
    router.back();
  };

  // 채팅 종료 확인 - 취소
  const handleCancelExitChat = () => {
    setShowExitChatModal(false);
  };

  // 버튼 호버 애니메이션 함수들
  const handleRefreshButtonHoverIn = () => {
    Animated.spring(refreshButtonScale, {
      toValue: 1.1,
      useNativeDriver: true,
    }).start();
  };

  const handleRefreshButtonHoverOut = () => {
    Animated.spring(refreshButtonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handleCloseButtonHoverIn = () => {
    Animated.spring(closeButtonScale, {
      toValue: 1.1,
      useNativeDriver: true,
    }).start();
  };

  const handleCloseButtonHoverOut = () => {
    Animated.spring(closeButtonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // 헤더 버튼 기능들
  const handlePlay = () => {
    console.log('재생 버튼 클릭');
    alert('[강의 지원 기능]\n서비스 준비 중입니다.');
    // setIsPlaySelected(!isPlaySelected);
    // 재생 기능 구현
  };

  const handleCloud = () => {
    console.log('클라우드 업로드 버튼 클릭');
    alert('[필기 저장 기능]\n서비스 준비 중입니다.');
    // setIsCloudSelected(!isCloudSelected);
    // 클라우드 업로드 기능 구현
  };

  const handleBookmark = () => {
    console.log('북마크 버튼 클릭');
    alert('[북마크 기능]\n서비스 준비 중입니다.');
    // setIsBookmarkSelected(!isBookmarkSelected);
    // 북마크 기능 구현
  };

  const handleBook = () => {
    console.log('책 버튼 클릭');
    alert('[답지 보기 기능]\n서비스 준비 중입니다.');
    // setIsBookSelected(!isBookSelected);
    // 책 관련 기능 구현
  };

  const handleMaesaen = () => {
    console.log('매쓰천재 버튼 클릭');
    setIsMaesaenSelected(!isMaesaenSelected);
    handleChatbotOpen();
  };

  const handleEye = () => {
    console.log('보기 버튼 클릭 - 읽기/쓰기 모드 전환');
    
    // 툴바 표시/숨김 토글
    const newVisibility = !isToolbarVisible;
    setIsToolbarVisible(newVisibility);
    setIsEyeSelected(newVisibility);
    
    console.log(`모드 전환: ${newVisibility ? '쓰기 모드' : '읽기 모드'}`);
    
    // 애니메이션 실행
    Animated.timing(toolbarAnimation, {
      toValue: newVisibility ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
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

  // 손가락 터치와 펜 터치 구분 함수 - 더 엄격한 조건
  const isPenTouch = (event: any) => {
    const { touches, force, pressure, majorRadius, minorRadius } = event.nativeEvent;
    
    console.log('터치 이벤트 분석:', { 
      touches: touches?.length, 
      force, 
      pressure, 
      majorRadius, 
      minorRadius 
    });
    
    // 터치 포인트가 1개인지 확인
    if (touches && touches.length !== 1) {
      console.log('멀티터치 감지 - 손가락으로 판단');
      return false;
    }
    
    // force나 pressure가 있으면 펜으로 인식 (가장 확실한 방법)
    if (force && force > 0) {
      console.log('Force 감지 - 펜으로 판단:', force);
      return true;
    }
    if (pressure && pressure > 0) {
      console.log('Pressure 감지 - 펜으로 판단:', pressure);
      return true;
    }
    
    // 터치 영역 크기로 구분 (펜은 보통 더 작은 영역)
    if (majorRadius && minorRadius) {
      const touchArea = Math.PI * majorRadius * minorRadius;
      console.log('터치 영역 크기:', touchArea);
      if (touchArea < 50) { // 매우 작은 영역이면 펜으로 판단
        console.log('작은 터치 영역 - 펜으로 판단');
        return true;
      }
    }
    
    // 터치 시간 간격으로 구분 (손가락은 보통 빠른 연속 터치)
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTime;
    
    // 터치 간격이 너무 짧으면 손가락으로 판단
    if (timeDiff < 200) {
      console.log('터치 간격이 너무 짧음 - 손가락으로 판단:', timeDiff);
      return false;
    }
    
    // 터치 지속 시간으로 구분 (펜은 보통 더 오래 누름)
    const touchDuration = currentTime - touchStartTime;
    if (touchDuration > 300) {
      console.log('터치 지속시간이 길음 - 펜으로 판단:', touchDuration);
      return true;
    }
    
    // 기본적으로 손가락으로 판단 (안전한 선택)
    console.log('기본적으로 손가락 터치로 판단됨');
    return false;
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
    
    console.log('필기 모드 활성화 - 필기 시작');
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

  // 오답노트 저장 확인 모달 표시
  const showIncorrectNotesConfirmation = (action: 'refresh' | 'close') => {
    setPendingAction(action);
    setShowIncorrectNotesModal(true);
  };

  // 오답노트 저장 확인 - 저장하기
  const handleSaveToIncorrectNotes = async () => {
    // 모달 바로 닫기
    setShowIncorrectNotesModal(false);
    setPendingAction(null);
    
    // 로딩 시작
    setIsGeneratingReport(true);
    
    try {
      if (!currentConversationId || !currentUserId || !currentProblemId) {
        console.warn('저장할 수 있는 데이터가 없습니다.');
        return;
      }

      // 1. 오답 리포트 생성 API 호출
      const token = await getAccessToken();
      if (!token) {
        console.warn('인증 토큰이 없습니다. 다시 로그인해주세요.');
        return;
      }

      console.log('오답 리포트 생성 시작:', {
        conversation_id: currentConversationId,
        user_id: currentUserId,
        problem_id: currentProblemId
      });

      // 오답 리포트 생성
      const reportResponse = await fetch(`http://52.79.233.106/fastapi/incorrect-answer-report/${currentConversationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!reportResponse.ok) {
        console.error('오답 리포트 생성 실패:', reportResponse.status);
        return;
      }

      const reportData = await reportResponse.json();
      console.log('오답 리포트 생성 성공:', reportData);

      // 2. reports 테이블에 저장
      const saveReportResponse = await fetch('http://52.79.233.106/fastapi/reports/save', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversation_id: currentConversationId,
          user_id: currentUserId,
          p_id: currentProblemId,
          status: 'completed',
          report_type: 'incorrect_answer',
          language: 'ko',
          learning_stats: {
            total_attempts: chatMessages.length,
            correct_answers: 0, // 실제 정답 수는 별도 계산 필요
            accuracy_rate: 0.0,
            total_time_seconds: 0 // 실제 학습 시간은 별도 계산 필요
          },
          full_report_content: reportData.report,
          prompt_tokens: reportData.metadata?.token_usage?.report_prompt_tokens || 0,
          response_tokens: reportData.metadata?.token_usage?.report_response_tokens || 0,
          total_tokens: reportData.metadata?.token_usage?.total_tokens || 0
        })
      });

      if (!saveReportResponse.ok) {
        console.error('reports 테이블 저장 실패:', saveReportResponse.status);
        return;
      }

      const savedReportData = await saveReportResponse.json();
      console.log('reports 테이블 저장 성공:', savedReportData);

      // 3. 대화 세션 완료 처리
      const completeResponse = await fetch(`http://52.79.233.106/fastapi/conversation/${currentConversationId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (completeResponse.ok) {
        console.log('대화 세션 완료됨:', currentConversationId);
      } else {
        console.error('대화 세션 완료 실패:', completeResponse.status);
      }
      
      // 분할 모드 하단 창 닫기
      setIsSplitMode(false);
      
      // 로딩 종료
      setIsGeneratingReport(false);
      
      // 성공 토스트 메시지 표시
      showToastMessage('문제가 오답노트에 저장되었습니다!');
      
      // 원래 액션 실행
      if (pendingAction === 'refresh') {
        await handleRefreshAction();
      } else if (pendingAction === 'close') {
        await handleCloseAction();
      }
    } catch (error) {
      console.error('오답노트 저장 오류:', error);
      setIsGeneratingReport(false);
      showToastMessage('저장 중 오류가 발생했습니다.');
    }
  };

  // 오답노트 저장 확인 - 저장하지 않기
  const handleDontSaveToIncorrectNotes = async () => {
    // 모달 닫기
    setShowIncorrectNotesModal(false);
    setPendingAction(null);
    
    // 원래 액션 실행
    if (pendingAction === 'refresh') {
      await handleRefreshAction();
    } else if (pendingAction === 'close') {
      await handleCloseAction();
    }
  };

  // 새로고침 액션 실행
  const handleRefreshAction = async () => {
    // 현재 대화 세션 완료 처리
    if (currentConversationId) {
      try {
        const completeResponse = await fetch(`http://52.79.233.106/fastapi/conversation/${currentConversationId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (completeResponse.ok) {
          console.log('대화 세션 완료됨:', currentConversationId);
        } else {
          console.error('대화 세션 완료 실패:', completeResponse.status);
        }
      } catch (error) {
        console.error('대화 세션 완료 오류:', error);
      }
    }
    
    // 새로운 대화 세션 생성
    if (currentUserId && currentProblemId) {
      try {
        const conversationResponse = await fetch('http://52.79.233.106/fastapi/conversation/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: currentUserId,
            p_id: currentProblemId
          })
        });
        
        if (conversationResponse.ok) {
          const conversationData = await conversationResponse.json();
          setCurrentConversationId(conversationData.conversation_id);
          console.log('새 대화 세션 생성됨:', conversationData.conversation_id);
        }
      } catch (error) {
        console.error('새 대화 세션 생성 오류:', error);
      }
    }
    
    // 채팅 메시지 초기화
    setChatMessages([]);
  };

  // 닫기 액션 실행
  const handleCloseAction = async () => {
    // 대화 세션 완료 처리
    if (currentConversationId) {
      try {
        const completeResponse = await fetch(`http://52.79.233.106/fastapi/conversation/${currentConversationId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (completeResponse.ok) {
          console.log('대화 세션 완료됨:', currentConversationId);
        } else {
          console.error('대화 세션 완료 실패:', completeResponse.status);
        }
      } catch (error) {
        console.error('대화 세션 완료 오류:', error);
      }
    }
    
                      // 상태 초기화
                  setIsSplitMode(false);
                  setChatMessages([]);
                  setCurrentConversationId(null);
                  setCurrentUserId(null);
                  setCurrentProblemId(null);
                  setCurrentProblemInfo(null);
  };

  const handleStepByStep = async () => {
    console.log('=== handleStepByStep 함수 호출됨 ===');
    console.log('단계별 풀이 배우기:', { pageNumber, problemNumber });
    
    if (!pageNumber || !problemNumber) {
      console.log('페이지 번호 또는 문제 번호가 비어있음');
      alert('페이지 번호와 문제 번호를 모두 입력해주세요.');
      return;
    }
    
    console.log('입력 검증 통과, 로딩 시작');
    
    // 매쓰천재 연결 로딩 시작
    console.log('setIsConnectingToTutor(true) 호출 전');
    setIsConnectingToTutor(true);
    console.log('setIsConnectingToTutor(true) 호출 후');
    // iOS에서 모달이 먼저 그려지도록 렌더링 양보
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    await new Promise(resolve => setTimeout(resolve, 0));
    if (Platform.OS === 'ios') {
      await new Promise(resolve => InteractionManager.runAfterInteractions(() => resolve(null)));
    }
    // 로딩 중에는 입력 모달을 먼저 닫아 로딩 팝업이 확실히 보이게 처리
    setShowChatbotModal(false);
    
    // 로딩 시작
    setIsChatbotLoading(true);
    
    try {
      // 1. 먼저 대화 세션 생성
      // 현재 사용자의 인증 토큰에서 사용자 ID 추출
      const userId = await extractUserIdFromToken();
      if (!userId) {
        // console.error('사용자 ID를 추출할 수 없습니다. 로그인이 필요합니다.');
        alert('로그인이 필요합니다. 다시 로그인해주세요.');
        return;
      }
      
      // 페이지 번호와 문제 번호로부터 실제 문제 ID 조회
      let problemId = null; // 기본값을 null로 설정
      
      try {
        const problemResponse = await fetch(`http://52.79.233.106/fastapi/problems/search?page=${pageNumber}&number=${problemNumber}`);
        
        if (problemResponse.ok) {
          const problemData = await problemResponse.json();
          console.log('문제 조회 응답:', problemData);
          
          if (problemData && problemData.p_id) {
            problemId = problemData.p_id;
            console.log('문제 ID 조회됨:', problemId);
            
            // 문제 정보 저장 (오답노트 모달용)
            setCurrentProblemInfo({
              page: pageNumber,
              number: problemNumber,
              bookName: problemData.p_name || '유형체크 N제 중학 수학 1-1'
            });
          } else {
            console.warn('문제 데이터에서 p_id를 찾을 수 없음:', problemData);
            throw new Error('문제 데이터에서 p_id를 찾을 수 없습니다.');
          }
        } else {
          // console.error('문제 ID 조회 실패:', problemResponse.status, problemResponse.statusText);
          const errorText = await problemResponse.text();
          // console.error('에러 응답:', errorText);
          throw new Error(`문제 조회 실패: ${problemResponse.status}`);
        }
      } catch (error) {
        // console.error('문제 ID 조회 중 네트워크 오류:', error);
        alert('문제를 찾을 수 없습니다. 페이지 번호와 문제 번호를 확인해주세요.');
        return;
      }
      
      if (!problemId) {
        // console.error('문제 ID를 찾을 수 없습니다.');
        alert('문제를 찾을 수 없습니다. 페이지 번호와 문제 번호를 확인해주세요.');
        return;
      }
      
      console.log('대화 세션 생성 요청:', { user_id: userId, p_id: problemId });
      
      const conversationResponse = await fetch('http://52.79.233.106/fastapi/conversation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          p_id: problemId
        })
      });
      
      console.log('대화 세션 생성 응답 상태:', conversationResponse.status);
      
      if (!conversationResponse.ok) {
        const errorText = await conversationResponse.text();
        console.error('대화 세션 생성 실패:', conversationResponse.status, errorText);
        throw new Error(`대화 세션 생성 실패: ${conversationResponse.status} - ${errorText}`);
      }
      
      const conversationData = await conversationResponse.json();
      console.log('대화 세션 생성 응답 데이터:', conversationData);
      
      if (!conversationData.conversation_id) {
        console.error('대화 세션 ID가 응답에 없음:', conversationData);
        throw new Error('대화 세션 ID가 응답에 없습니다');
      }
      
      const conversationId = conversationData.conversation_id;
      
      // 상태에 저장
      setCurrentConversationId(conversationId);
      setCurrentUserId(userId);
      setCurrentProblemId(problemId);
      
      console.log('대화 세션 생성됨:', conversationId);
      
      // 2. 대화형 튜터 시작 - 첫 번째 단계 제시
      const response = await fetch('http://52.79.233.106/fastapi/ai/step-by-step-solution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_number: pageNumber,
          problem_number: problemNumber,
          conversation_id: conversationId,
          user_message: '시작' // 첫 번째 단계 시작 신호
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('AI 첫 번째 단계 응답:', data);
      
      // 3. AI 응답을 데이터베이스에 저장
      const chatResponse = await fetch('http://52.79.233.106/fastapi/chat/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: userId,
          p_id: problemId,
          sender_role: 'dasida',
          message: data.solution,
          message_type: 'text'
        })
      });
      
      if (!chatResponse.ok) {
        console.error('채팅 메시지 저장 실패:', chatResponse.status);
      }
      
      // 분할 화면 모드로 전환하고 AI 응답을 채팅에 추가
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsSplitMode(true);
      
      // 매쓰천재 연결 로딩 종료
      setIsConnectingToTutor(false);
      
      // AI 응답을 채팅 메시지로 추가
      const aiMessage: ChatMessage = {
        id: Date.now(),
        type: 'bot',
        message: data.solution,
        avatar: '🧠',
        problemInfo: data.problem_info,
        tokenUsage: data.token_usage,
        currentStep: data.current_step || 1,
        attempts: data.attempts || {}
      };
      setChatMessages([aiMessage]);
      
      // 첫 번째 AI 응답 후 스크롤을 맨 아래로 이동
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      // 입력 필드 초기화
      setPageNumber('');
      setProblemNumber('');
      
    } catch (error) {
      console.error('AI 풀이 요청 오류:', error);
      alert('AI 풀이를 가져오는 중 오류가 발생했습니다. 서버가 실행 중인지 확인해주세요.');
    } finally {
      // 로딩 종료
      setIsChatbotLoading(false);
      setIsConnectingToTutor(false);
    }
  };

  const handleDirectSolution = async () => {
    console.log('풀이 바로가기:', { pageNumber, problemNumber });
    
    if (!pageNumber || !problemNumber) {
      alert('페이지 번호와 문제 번호를 모두 입력해주세요.');
      return;
    }
    
    // 로딩 시작
    setIsChatbotLoading(true);
    
    try {
      // 1. 먼저 대화 세션 생성
      // 현재 사용자의 인증 토큰에서 사용자 ID 추출
      const userId = await extractUserIdFromToken();
      if (!userId) {
        console.error('사용자 ID를 추출할 수 없습니다. 로그인이 필요합니다.');
        alert('로그인이 필요합니다. 다시 로그인해주세요.');
        return;
      }
      
      // 페이지 번호와 문제 번호로부터 실제 문제 ID 조회
      let problemId = null; // 기본값을 null로 설정
      
      try {
        const problemResponse = await fetch(`http://52.79.233.106/fastapi/problems/search?page=${pageNumber}&number=${problemNumber}`);
        
        if (problemResponse.ok) {
          const problemData = await problemResponse.json();
          console.log('문제 조회 응답:', problemData);
          
          if (problemData && problemData.p_id) {
            problemId = problemData.p_id;
            console.log('문제 ID 조회됨:', problemId);
            
            // 문제 정보 저장 (오답노트 모달용)
            setCurrentProblemInfo({
              page: pageNumber,
              number: problemNumber,
              bookName: problemData.p_name || '유형체크 N제 중학 수학 1-1'
            });
          } else {
            console.warn('문제 데이터에서 p_id를 찾을 수 없음:', problemData);
            throw new Error('문제 데이터에서 p_id를 찾을 수 없습니다.');
          }
        } else {
          console.error('문제 ID 조회 실패:', problemResponse.status, problemResponse.statusText);
          const errorText = await problemResponse.text();
          console.error('에러 응답:', errorText);
          throw new Error(`문제 조회 실패: ${problemResponse.status}`);
        }
      } catch (error) {
        console.error('문제 ID 조회 중 네트워크 오류:', error);
        alert('문제를 찾을 수 없습니다. 페이지 번호와 문제 번호를 확인해주세요.');
        return;
      }
      
      if (!problemId) {
        console.error('문제 ID를 찾을 수 없습니다.');
        alert('문제를 찾을 수 없습니다. 페이지 번호와 문제 번호를 확인해주세요.');
        return;
      }
      
      console.log('대화 세션 생성 요청:', { user_id: userId, p_id: problemId });
      
      const conversationResponse = await fetch('http://52.79.233.106/fastapi/conversation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          p_id: problemId
        })
      });
      
      console.log('대화 세션 생성 응답 상태:', conversationResponse.status);
      
      if (!conversationResponse.ok) {
        const errorText = await conversationResponse.text();
        console.error('대화 세션 생성 실패:', conversationResponse.status, errorText);
        throw new Error(`대화 세션 생성 실패: ${conversationResponse.status} - ${errorText}`);
      }
      
      const conversationData = await conversationResponse.json();
      console.log('대화 세션 생성 응답 데이터:', conversationData);
      
      if (!conversationData.conversation_id) {
        console.error('대화 세션 ID가 응답에 없음:', conversationData);
        throw new Error('대화 세션 ID가 응답에 없습니다');
      }
      
      const conversationId = conversationData.conversation_id;
      
      // 상태에 저장
      setCurrentConversationId(conversationId);
      setCurrentUserId(userId);
      setCurrentProblemId(problemId);
      
      console.log('대화 세션 생성됨:', conversationId);
      
      // 2. FastAPI 프롬프팅 엔지니어링 호출
      const response = await fetch('http://52.79.233.106/fastapi/ai/direct-solution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_number: pageNumber,
          problem_number: problemNumber
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('AI 응답:', data);
      
      // 3. AI 응답을 데이터베이스에 저장
      const chatResponse = await fetch('http://52.79.233.106/fastapi/chat/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: userId,
          p_id: problemId,
          sender_role: 'dasida',
          message: `⚡ ${pageNumber}페이지 ${problemNumber}번 문제 풀이\n\n${data.solution}`,
          message_type: 'text'
        })
      });
      
      if (!chatResponse.ok) {
        console.error('채팅 메시지 저장 실패:', chatResponse.status);
      }
      
      // 분할 화면 모드로 전환하고 AI 응답을 채팅에 추가
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setIsSplitMode(true);
      setShowChatbotModal(false);
      
      // AI 응답을 채팅 메시지로 추가
      const aiMessage: ChatMessage = {
        id: Date.now(),
        type: 'bot',
        message: `⚡ ${pageNumber}페이지 ${problemNumber}번 문제 풀이\n\n${data.solution}`,
        avatar: '🧠',
        problemInfo: data.problem_info,
        tokenUsage: data.token_usage,
        currentStep: data.current_step || 1,
        attempts: data.attempts || {}
      };
      setChatMessages([aiMessage]);
      
      // 직접 풀이 AI 응답 후 스크롤을 맨 아래로 이동
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      // 입력 필드 초기화
      setPageNumber('');
      setProblemNumber('');
      
    } catch (error) {
      console.error('AI 풀이 요청 오류:', error);
      alert('AI 풀이를 가져오는 중 오류가 발생했습니다. 서버가 실행 중인지 확인해주세요.');
    } finally {
      // 로딩 종료
      setIsChatbotLoading(false);
    }
  };

  // 드래그 제스처 핸들러
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // 드래그 시작 시 현재 비율을 기준으로 고정
        splitStartRef.current = splitRatio;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      },
      onPanResponderMove: (evt, gestureState) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        // 시작 시점 비율에서 상대 이동 적용 (실제 분할 영역 높이 기준)
        const usableHeight = splitAreaHeightRef.current || height;
        const delta = gestureState.dy / usableHeight;
        const newRatio = Math.max(0, Math.min(1, splitStartRef.current + delta));
        setSplitRatio(newRatio);
      },
      onPanResponderRelease: () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        console.log('드래그 완료');
      },
    })
  ).current;

  // 메시지 전송
  const handleSendMessage = async () => {
    if (userInput.trim()) {
      const newMessage: ChatMessage = {
        id: Date.now(),
        type: 'user',
        message: userInput.trim(),
        avatar: '👤'
      };
      setChatMessages(prev => [...prev, newMessage]);
      setUserInput('');
      
      // 로딩 시작
      setIsChatbotLoading(true);
      
      // 스크롤을 맨 아래로 이동
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      // 대화형 튜터와의 상호작용
      try {
        // 대화 세션이 없으면 새로 생성
        let conversationId = currentConversationId;
        let userId = currentUserId;
        let problemId = currentProblemId;
        
        if (!conversationId || !userId || !problemId) {
          // 현재 사용자의 인증 토큰에서 사용자 ID 추출
          const extractedUserId = await extractUserIdFromToken();
          if (!extractedUserId) {
            console.error('사용자 ID를 추출할 수 없습니다. 로그인이 필요합니다.');
            alert('로그인이 필요합니다. 다시 로그인해주세요.');
            return;
          }
          userId = extractedUserId;
          
          // 기본 문제 ID 사용 (실제로는 현재 보고 있는 문제의 ID를 사용해야 함)
          problemId = problemId || 1;
          
          // 새 대화 세션 생성
          console.log('새 대화 세션 생성 요청:', { user_id: userId, p_id: problemId });
          
          const conversationResponse = await fetch('http://52.79.233.106/fastapi/conversation/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: userId,
              p_id: problemId
            })
          });
          
          console.log('대화 세션 생성 응답 상태:', conversationResponse.status);
          
          if (conversationResponse.ok) {
            const conversationData = await conversationResponse.json();
            console.log('대화 세션 생성 응답 데이터:', conversationData);
            
            if (conversationData.conversation_id) {
              conversationId = conversationData.conversation_id;
              
              // 상태 업데이트
              setCurrentConversationId(conversationId);
              setCurrentUserId(userId);
              setCurrentProblemId(problemId);
              
              console.log('새 대화 세션 생성됨:', conversationId);
            } else {
              console.error('대화 세션 ID가 응답에 없음:', conversationData);
              throw new Error('대화 세션 ID가 응답에 없습니다');
            }
          } else {
            const errorText = await conversationResponse.text();
            console.error('대화 세션 생성 실패:', conversationResponse.status, errorText);
            throw new Error(`대화 세션 생성 실패: ${conversationResponse.status} - ${errorText}`);
          }
        }
        
        // 사용자 메시지를 데이터베이스에 저장
        const userChatResponse = await fetch('http://52.79.233.106/fastapi/chat/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            user_id: userId,
            p_id: problemId,
            sender_role: 'user',
            message: newMessage.message,
            message_type: 'text'
          })
        });
        
        // if (!userChatResponse.ok) {
        //   console.error('사용자 메시지 저장 실패:', userChatResponse.status);
        // }
        
        // 대화형 튜터에게 사용자 응답 전송
        const tutorResponse = await fetch('http://52.79.233.106/fastapi/ai/step-by-step-solution', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            user_message: newMessage.message,
            current_step: chatMessages.length > 0 && chatMessages[chatMessages.length - 1].currentStep ? chatMessages[chatMessages.length - 1].currentStep : 1,
            attempts: chatMessages.length > 0 && chatMessages[chatMessages.length - 1].attempts ? chatMessages[chatMessages.length - 1].attempts : {}
          })
        });
        
        if (!tutorResponse.ok) {
          throw new Error(`튜터 응답 실패: ${tutorResponse.status}`);
        }
        
        const tutorData = await tutorResponse.json();
        console.log('튜터 응답:', tutorData);
        
        // 튜터 응답을 데이터베이스에 저장
        const tutorChatResponse = await fetch('http://52.79.233.106/fastapi/chat/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            user_id: userId,
            p_id: problemId,
            sender_role: 'dasida',
            message: tutorData.solution,
            message_type: 'text'
          })
        });
        
        if (!tutorChatResponse.ok) {
          console.error('튜터 메시지 저장 실패:', tutorChatResponse.status);
        }
        
        // 튜터 응답을 채팅에 추가
        const aiResponse: ChatMessage = {
          id: Date.now() + 1,
          type: 'bot',
          message: tutorData.solution,
          avatar: '🧠',
          problemInfo: tutorData.problem_info,
          tokenUsage: tutorData.token_usage,
          currentStep: tutorData.current_step || 1,
          attempts: tutorData.attempts || {}
        };
        setChatMessages(prev => [...prev, aiResponse]);
        
        // AI 응답 후 스크롤을 맨 아래로 이동
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
        
      } catch (error) {
        console.error('대화형 튜터 오류:', error);
        const aiResponse: ChatMessage = {
          id: Date.now() + 1,
          type: 'bot',
          message: '튜터 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.',
          avatar: '🧠'
        };
        setChatMessages(prev => [...prev, aiResponse]);
        
        // 에러 메시지 후 스크롤을 맨 아래로 이동
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } finally {
        // 로딩 종료
        setIsChatbotLoading(false);
      }
    }
  };

  // StatusBar 높이 가져오기
  React.useEffect(() => {
    if (Platform.OS === 'ios') {
      const { StatusBarManager } = NativeModules;
      StatusBarManager.getHeight((statusBarFrameData) => {
        setStatusBarHeight(statusBarFrameData.height);
      });
    }
  }, []);

  // 안드로이드에서 LayoutAnimation 활성화
  React.useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // 키보드 이벤트 리스너 설정
  React.useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  // 컴포넌트 마운트 시 초기 상태를 히스토리에 저장
  React.useEffect(() => {
    // 빈 필기 상태를 히스토리에 저장
    saveToHistory([]);
  }, []);

  // isConnectingToTutor 상태 변화 추적
  React.useEffect(() => {
    console.log('🔄 isConnectingToTutor 상태 변화:', isConnectingToTutor);
  }, [isConnectingToTutor]);

  // 컴포넌트 마운트 시 PDF 로드
  React.useEffect(() => {
    // 데이터베이스에서 가져온 file_path를 사용
    const filePath = '/uploads/textbooks/checkN_textbook.pdf';
    
    // 여러 URL을 시도하여 PDF 로드
    const tryLoadPDF = async () => {
      const directUrl = `http://52.79.233.106${filePath}`;
      
      try {
        console.log('PDF URL 확인:', directUrl);
        const response = await fetch(directUrl, { method: 'HEAD' });
        if (response.ok) {
          console.log('PDF URL 성공:', directUrl);
          
          // 안드로이드와 iOS 모두에서 PDF를 직접 표시하도록 Google Docs Viewer 사용
          const googleDocsViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(directUrl)}`;
          console.log('Google Docs Viewer URL:', googleDocsViewerUrl);
          setPdfSource(googleDocsViewerUrl);
          return;
        }
      } catch (error) {
        console.log('PDF URL 실패:', directUrl, error);
      }
      
      // Google Docs Viewer가 실패한 경우 PDF.js 사용
      try {
        const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(directUrl)}`;
        console.log('PDF.js URL 시도:', pdfJsUrl);
        setPdfSource(pdfJsUrl);
        return;
      } catch (error) {
        console.log('PDF.js URL 실패:', error);
      }
      
      // 모든 방법이 실패한 경우
      console.error('모든 PDF 뷰어 시도 실패');
      alert('PDF 파일을 로드할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
    };
    
    tryLoadPDF();
  }, []);

  // LaTeX 수식을 렌더링하는 함수
  const renderTextWithLatex = (text: string) => {
    if (!text) return null;
    
    // 마크다운과 LaTeX를 함께 처리
    const processedText = processLatexInText(text);
    
    // 마크다운 패턴들을 처리 (더 정교한 정규식)
    const parts = processedText.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$[^$]+\$|#{1,3}\s+[^\n]+|\n-|\n\d+\.|\n\n)/g);
    
    return (
      <Text style={styles.messageText}>
        {parts.map((part, index) => {
          // 굵은 글씨 처리
          if (part.startsWith('**') && part.endsWith('**')) {
            const content = part.slice(2, -2);
            return <Text key={index} style={{ fontWeight: 'bold', color: '#2C3E50' }}>{content}</Text>;
          }
          
          // 기울임 글씨 처리
          if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
            const content = part.slice(1, -1);
            return <Text key={index} style={{ fontStyle: 'italic', color: '#34495E' }}>{content}</Text>;
          }
          
          // 인라인 코드 처리
          if (part.startsWith('`') && part.endsWith('`')) {
            const content = part.slice(1, -1);
            return (
              <Text key={index} style={{ 
                backgroundColor: 'rgba(56, 97, 218, 0.1)', 
                padding: 4, 
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 14,
                color: '#3861DA'
              }}>
                {content}
              </Text>
            );
          }
          
          // LaTeX 수식 처리
          if (part.startsWith('$') && part.endsWith('$')) {
            const latex = part.slice(1, -1);
            return (
              <View key={index} style={styles.latexContainer}>
                <KaTeX
                  expression={latex}
                />
              </View>
            );
          }
          
          // 제목 처리
          if (part.match(/^#{1,3}\s+/)) {
            const match = part.match(/^(#{1,3})/);
            if (match) {
              const level = match[0].length;
              const content = part.replace(/^#{1,3}\s+/, '');
              const fontSize = level === 1 ? 18 : level === 2 ? 17 : 16;
              return (
                <Text key={index} style={{ 
                  fontSize, 
                  fontWeight: 'bold', 
                  marginTop: 12, 
                  marginBottom: 8,
                  color: '#2C3E50',
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E5E5',
                  paddingBottom: 4
                }}>
                  {content}
                </Text>
              );
            }
          }
          
          // 리스트 처리
          if (part.match(/^\n-|\n\d+\./)) {
            const content = part.replace(/^\n-|\n\d+\./, '');
            return (
              <Text key={index} style={{ 
                marginLeft: 16, 
                marginVertical: 2,
                color: '#34495E'
              }}>
                • {content}
              </Text>
            );
          }
          
          // 빈 줄 처리
          if (part === '\n\n') {
            return <Text key={index} style={{ height: 8 }}>{'\n'}</Text>;
          }
          
          // 일반 텍스트
          return <Text key={index} style={{ color: '#2C3E50' }}>{part}</Text>;
        })}
      </Text>
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
            <ThemedText style={styles.headerTitle}>유형체크 N제 중학 수학 1-1</ThemedText>
            <ThemedView style={styles.headerActions}>
              <TouchableOpacity 
                style={styles.disabledActionButton}
                onPress={handlePlay}
                onPressIn={() => setHoveredButton('play')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={
                    isPlaySelected 
                      ? (hoveredButton === 'play' 
                          ? require('@/assets/images/play_lected_hover.png')
                          : require('@/assets/images/play_lected.png'))
                      : require('@/assets/images/play.png')
                  } 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.disabledActionButton}
                onPress={handleCloud}
                onPressIn={() => setHoveredButton('cloud')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={require('@/assets/images/cloud.png')} 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.disabledActionButton}
                onPress={handleBookmark}
                onPressIn={() => setHoveredButton('bookmark')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={
                    isBookmarkSelected 
                      ? (hoveredButton === 'bookmark' 
                          ? require('@/assets/images/bookmark_lected_hover.png')
                          : require('@/assets/images/bookmark_lcted.png'))
                      : require('@/assets/images/bookmark.png')
                  } 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.disabledActionButton}
                onPress={handleBook}
                onPressIn={() => setHoveredButton('book')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={
                    isBookSelected 
                      ? (hoveredButton === 'book' 
                          ? require('@/assets/images/book_lected_hover.png')
                          : require('@/assets/images/book_lected.png'))
                      : require('@/assets/images/book.png')
                  } 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={handleMaesaen}
                onPressIn={() => setHoveredButton('maesaen')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={
                    isMaesaenSelected 
                      ? (hoveredButton === 'maesaen' 
                          ? require('@/assets/images/maesaen_lected_hover.png')
                          : require('@/assets/images/maesaen_lected.png'))
                      : (hoveredButton === 'maesaen' 
                          ? require('@/assets/images/maesaen_unselected_hover.png')
                          : require('@/assets/images/maesaen.png'))
                  } 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={handleEye}
                onPressIn={() => setHoveredButton('eye')}
                onPressOut={() => setHoveredButton(null)}
              >
                <Image 
                  source={
                    isToolbarVisible 
                      ? (hoveredButton === 'eye' 
                          ? require('@/assets/images/write_hover.png')
                          : require('@/assets/images/write_default.png'))
                      : (hoveredButton === 'eye' 
                          ? require('@/assets/images/eye_hover.png')
                          : require('@/assets/images/eye_default.png'))
                  } 
                  style={styles.headerIcon} 
                />
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Toolbar */}
          <View style={{ overflow: 'hidden', height: isToolbarVisible ? 55 : 0 }}>
            <Animated.View style={[
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
            ]}>
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

      {/* Main Content - Problem Book PDF */}
      <View style={[
        isSplitMode ? styles.splitContainer : styles.pdfContainer,
        { display: isSplitMode ? 'flex' : 'flex' }
      ]}
        onLayout={(e) => {
          // 분할 가능한 전체 영역 높이를 저장하여 드래그 시 정규화에 사용
          splitAreaHeightRef.current = e.nativeEvent.layout.height;
        }}
      >
        {/* PDF 뷰어 - 항상 렌더링되지만 위치와 크기만 변경 */}
        <View style={[
          isSplitMode ? { flex: splitRatio } : styles.pdfContainer
        ]}>
          {pdfSource ? (
            <View style={isSplitMode ? { flex: 1 } : styles.pdf}>
              <WebView
                source={{ uri: pdfSource }}
                style={styles.webView}
                onLoadStart={() => console.log('PDF 로드 시작')}
                onLoadEnd={() => console.log('PDF 로드 완료')}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log('PDF 로드 오류:', nativeEvent);
                }}
                onMessage={(event) => {
                  console.log('WebView 메시지:', event.nativeEvent.data);
                }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>PDF를 불러오는 중...</Text>
                  </View>
                )}
                scalesPageToFit={true}
                bounces={false}
                scrollEnabled={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                allowsProtectedMedia={true}
                // 안드로이드에서 PDF 다운로드 방지 및 인라인 표시
                allowsFileAccess={false}
                allowsFileAccessFromFileURLs={false}
                allowsUniversalAccessFromFileURLs={false}
                mixedContentMode="compatibility"
                thirdPartyCookiesEnabled={false}
                sharedCookiesEnabled={false}
                // PDF 뷰어 설정
                originWhitelist={['*']}
                onNavigationStateChange={(navState) => {
                  console.log('네비게이션 상태:', navState);
                  // PDF 다운로드 시도 감지 및 차단
                  if (navState.url && navState.url.includes('.pdf') && navState.navigationType === 'other') {
                    console.log('PDF 다운로드 시도 감지됨, 차단됨');
                    return false;
                  }
                }}
                onContentProcessDidTerminate={() => {
                  console.log('WebView 프로세스 종료됨');
                }}
                // 안드로이드 PDF 뷰어를 위한 추가 설정
                {...(Platform.OS === 'android' && {
                  onShouldStartLoadWithRequest: (request) => {
                    // PDF 파일 다운로드 시도 차단
                    if (request.url && request.url.includes('.pdf')) {
                      console.log('PDF 다운로드 차단됨:', request.url);
                      return false;
                    }
                    return true;
                  }
                })}
              />
              
              {/* 필기 오버레이 */}
              <View 
                style={styles.drawingOverlay}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                pointerEvents={isToolbarVisible ? 'auto' : 'none'}
              >
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
              </View>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>PDF를 불러오는 중...</Text>
            </View>
          )}
        </View>

        {/* 분할 모드일 때만 표시되는 요소들 */}
        {isSplitMode && (
          <>
            {/* 드래그 가능한 분할선 */}
            <View 
              style={styles.divider}
              {...panResponder.panHandlers}
            >
              <Image 
                source={require('@/assets/images/divider_bar.png')} 
                style={styles.dividerImage}
                resizeMode="contain"
              />
            </View>

            {/* 하단: AI 수학 튜터 */}
            <KeyboardAvoidingView 
              style={[styles.chatbotContainer, { flex: 1 - splitRatio }]}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'ios' ? statusBarHeight + 60 : 60 + 30}
            >
              <View style={styles.chatbotHeader}>
                <Text style={styles.chatbotTitle}>
                  {currentProblemInfo ? `p.${currentProblemInfo.page} ${currentProblemInfo.number}번` : '매쓰천재'}
                </Text>

                <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 10 }}>
                  {/* 새로고침 버튼
                  <Animated.View style={{ transform: [{ scale: refreshButtonScale }] }}>
                    <TouchableOpacity 
                      onPress={() => showIncorrectNotesConfirmation('refresh')} 
                      onPressIn={handleRefreshButtonHoverIn}
                      onPressOut={handleRefreshButtonHoverOut}
                      style={{ width: 48, height: 48 }}
                    >
                      <Image 
                        source={require('@/assets/images/refresh.png')} 
                        style={{ width: 48, height: 48 }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  </Animated.View> */}

                  {/* 닫기 버튼 */}
                  <Animated.View style={{ transform: [{ scale: closeButtonScale }] }}>
                    <TouchableOpacity 
                      onPress={() => showIncorrectNotesConfirmation('close')} 
                      onPressIn={handleCloseButtonHoverIn}
                      onPressOut={handleCloseButtonHoverOut}
                      style={{ width: 48, height: 48 }}
                    >
                      <Image 
                        source={require('@/assets/images/close.png')} 
                        style={{ width: 48, height: 48 }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              <ScrollView 
                ref={scrollViewRef}
                style={styles.chatContainer} 
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  // 내용이 변경될 때마다 스크롤을 맨 아래로 이동
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }}
              >
                {chatMessages.map((msg) => (
                  <View key={msg.id} style={[
                    styles.messageContainer,
                    msg.type === 'user' ? styles.userMessage : styles.botMessage
                  ]}>
                    {msg.type === 'bot' && (
                      <View style={styles.messageAvatar}>
                        <Image 
                          source={require('@/assets/images/maesaen0.8.png')} 
                          style={styles.messageAvatarImage}
                        />
                      </View>
                    )}
                    <View style={[
                      styles.messageBubble,
                      msg.type === 'user' ? styles.userBubble : styles.botBubble
                    ]}>
                      {msg.type === 'user' ? (
                        <Text style={[
                          styles.messageText,
                          styles.userText
                        ]}>
                          {removeMetadataFromMessage(msg.message)}
                        </Text>
                      ) : (
                        <View>
                          <Text style={styles.messageText}>
                            {renderTextWithLatex(removeMetadataFromMessage(msg.message))}
                          </Text>
                        </View>
                      )}
                      
                      
                    </View>
                  </View>
                ))}
                
                {/* 챗봇 로딩 애니메이션 */}
                {isChatbotLoading && (
                  <View style={styles.chatbotLoadingContainer}>
                    <View style={styles.messageAvatar}>
                      <Image 
                        source={require('@/assets/images/maesaen0.8.png')} 
                        style={styles.messageAvatarImage}
                      />
                    </View>
                    <View style={[styles.messageBubble, styles.botBubble]}>
                      <View style={styles.typingIndicator}>
                        <Animated.View style={[
                          styles.typingDot,
                          {
                            opacity: typingAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.3, 1],
                            }),
                          }
                        ]} />
                        <Animated.View style={[
                          styles.typingDot,
                          {
                            opacity: typingAnimation.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [0.3, 1, 0.3],
                            }),
                          }
                        ]} />
                        <Animated.View style={[
                          styles.typingDot,
                          {
                            opacity: typingAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0.3],
                            }),
                          }
                        ]} />
                      </View>
                    </View>
                  </View>
                )}
                
              </ScrollView>

              {/* 입력 필드 */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.inputField}
                  placeholder="내용을 입력해 주세요"
                  placeholderTextColor="#BEBEBE"
                  value={userInput}
                  onChangeText={setUserInput}
                  multiline
                />
                <TouchableOpacity 
                  style={styles.sendButton}
                  onPress={handleSendMessage}
                >
                  <Image 
                    source={require('@/assets/images/send.png')} 
                    style={styles.sendButtonImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </>
        )}
      </View>

      {/* Chatbot Modal */}
      <Modal
        visible={showChatbotModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleChatbotClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>매생이 챗봇</Text>
              <TouchableOpacity onPress={handleChatbotClose} style={styles.closeButton}>
                <Image source={require('@/assets/images/close.png')} 
                style={styles.closeButtonImage}
                 />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalQuestion}>어떤 문제를 풀어 볼까요? (예: 101페이지 666번)</Text>
            
            {/* Text Fields */}
            <View style={styles.textFieldsContainer}>
              <View style={styles.textFieldWrapper}>
                <TextInput
                  style={styles.textField}
                  placeholder="페이지 번호를 입력하세요"
                  placeholderTextColor="#BEBEBE"
                  value={pageNumber}
                  onChangeText={setPageNumber}
                  keyboardType="numeric"
                />
                {pageNumber.length > 0 && (
              <TouchableOpacity 
                    style={styles.clearButton} 
                    onPress={() => setPageNumber('')}
              >
                    <Image source={require('@/assets/images/clear.png')} 
                    style={styles.clearButtonImage}
                     />
              </TouchableOpacity>
                )}
              </View>
              
              <View style={styles.textFieldWrapper}>
                <TextInput
                  style={styles.textField}
                  placeholder="문제번호를 입력하세요"
                  placeholderTextColor="#BEBEBE"
                  value={problemNumber}
                  onChangeText={setProblemNumber}
                  keyboardType="numeric"
                />
                {problemNumber.length > 0 && (
              <TouchableOpacity 
                    style={styles.clearButton} 
                    onPress={() => setProblemNumber('')}
              >
                    <Image source={require('@/assets/images/clear.png')} 
                    style={styles.clearButtonImage}
                     />
              </TouchableOpacity>
                )}
              </View>
            </View>
            
            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.primaryButton]}
                onPress={() => {
                  console.log('=== 버튼 클릭됨 ===');
                  handleStepByStep();
                }}
              >
                <Text style={styles.primaryButtonText}>단계별 풀이 배우기</Text>
              </TouchableOpacity>
              
              {/* <TouchableOpacity 
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={handleDirectSolution}
              >
                <Text style={styles.secondaryButtonText}>풀이 바로가기</Text>
              </TouchableOpacity> */}
            </View>
          </View>
        </View>
      </Modal>

      {/* 오답노트 저장 확인 모달 */}
      <Modal
        visible={showIncorrectNotesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowIncorrectNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.incorrectNotesModalContent}>
            {/* Header */}
            <View style={styles.incorrectNotesModalHeader}>
              <Text style={styles.incorrectNotesModalTitle}>오답노트에 저장</Text>
              <TouchableOpacity onPress={() => setShowIncorrectNotesModal(false)} style={styles.closeButton}>
                <Image source={require('@/assets/images/close.png')} 
                style={styles.closeButtonImage}
                 />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.incorrectNotesModalQuestion}>
              {currentProblemInfo?.bookName || '유형체크 N제 중학 수학 1-1'}{'\n'}
              p.{currentProblemInfo?.page || '117'} [{currentProblemInfo?.number || '812'}번] 문제를 오답노트에 저장할까요?
            </Text>
            
            {/* Buttons */}
            <View style={styles.incorrectNotesModalButtons}>
              <TouchableOpacity 
                style={[styles.incorrectNotesModalButton, styles.primaryButton]}
                onPress={handleSaveToIncorrectNotes}
              >
                <Text style={styles.primaryButtonText}>저장할게요</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.incorrectNotesModalButton, styles.secondaryButton]}
                onPress={handleDontSaveToIncorrectNotes}
              >
                <Text style={styles.secondaryButtonText}>아니에요</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 로딩 애니메이션 */}
      {isGeneratingReport && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3861DA" />
            <Text style={styles.loadingText}>오답 리포트 생성 중...</Text>
          </View>
        </View>
      )}

      {/* 매쓰천재 연결 로딩 */}
      <Modal
        visible={isConnectingToTutor}
        transparent={true}
        animationType={Platform.OS === 'ios' ? 'none' : 'fade'}
        onRequestClose={() => {}}
        {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3861DA" />
            <Text style={styles.loadingText}>수학 AI 튜터 매쓰 천재를 연결 중입니다...</Text>
            <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
              🔍 로딩 상태: {isConnectingToTutor ? '활성화' : '비활성화'}
            </Text>
          </View>
        </View>
      </Modal>

      {/* iOS 안전망: 모달이 혹시라도 표시되지 않을 때를 위한 인라인 오버레이 */}
      {Platform.OS === 'ios' && isConnectingToTutor && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3861DA" />
            <Text style={styles.loadingText}>수학 AI 튜터 매쓰 천재를 연결 중입니다...</Text>
          </View>
        </View>
      )}

      {/* 채팅 종료 확인 모달 */}
      <Modal
        visible={showExitChatModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelExitChat}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.exitChatModalContent}>
            {/* Header */}
            <View style={styles.exitChatModalHeader}>
              <Text style={styles.exitChatModalTitle}>채팅 종료 확인</Text>
              <TouchableOpacity onPress={handleCancelExitChat} style={styles.closeButton}>
                <Image source={require('@/assets/images/close.png')} 
                style={styles.closeButtonImage}
                 />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.exitChatModalQuestion}>
              채팅을 진행중입니다.{'\n'}이대로 화면을 나가면, 오답 리포트는 생성되지 않습니다.{'\n'}나가시겠습니까?
            </Text>
            
            {/* Buttons */}
            <View style={styles.exitChatModalButtons}>
              <TouchableOpacity 
                style={[styles.exitChatModalButton, styles.secondaryButton]}
                onPress={handleExitChat}
              >
                <Text style={styles.secondaryButtonText}>네, 나갈래요</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.exitChatModalButton, styles.primaryButton]}
                onPress={handleCancelExitChat}
              >
                <Text style={styles.primaryButtonText}>아니에요</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 토스트 알림 */}
      {showToast && (
        <Animated.View 
          style={[
            styles.toastContainer,
            {
              opacity: toastAnimation,
              transform: [
                {
                  translateY: toastAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
    height: 64,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  disabledActionButton: {
    padding: 8,
    marginLeft: 4,
    opacity: 0.5,
  },
  clearButtonImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  headerIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  closeButtonImage: {
    width: 40,
    height: 40,
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
  pdfContainer: {
    flex: 1,
    backgroundColor: '#fff',
    minHeight: 500,
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  webView: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  drawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#fff',
  },
  divider: {
    height: 24,
    width: '100%',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // 반드시 포함
  },
  dividerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  chatbotContainer: {
    backgroundColor: '#F5F5F5',
  },
  chatbotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  chatbotTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#000',
  },
  chatContainer: {
    backgroundColor: '#F5F5F5',
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: 30,
  },
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
    borderRadius: 15,
  },
  botBubble: {
    backgroundColor: '#FFFF',
    borderColor: '#3861DA',
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputField: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.43,
    lineHeight: 20,
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginRight: 10,
    minHeight: 50,
    maxHeight: 100,
    textAlignVertical: 'bottom',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonImage: {
    width: 24,
    height: 24,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    padding: 14,
    margin: 20,
    width: 341,
    minHeight: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingHorizontal: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 22,
    flex: 1,
  },
  closeButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -14,
    marginRight: -14,
  },
  modalQuestion: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 25.5,
    marginBottom: 15,
    paddingHorizontal: 8,
  },
  textFieldsContainer: {
    marginBottom: 20,
    paddingHorizontal: 0,
    gap: 0,
  },
  textFieldWrapper: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 0,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    height: 52,
    marginBottom: 0,
    overflow: 'hidden',
  },
  textField: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.43,
    lineHeight: 20,
    height: 52,
    color: '#000000',
    borderWidth: 0,
  },
  clearButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 20,
    height: 20,
    zIndex: 1,
  },
  modalButtons: {
    gap: 10,
    paddingHorizontal: 0,
  },
  modalButton: {
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3861DA',
  },
  secondaryButton: {
    backgroundColor: '#398CF0',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.43,
    lineHeight: 22,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.43,
    lineHeight: 22,
  },
  problemInfoContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(56, 97, 218, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3861DA',
  },
  problemInfoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  problemInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3861DA',
    width: 50,
  },
  problemInfoValue: {
    fontSize: 13,
    color: '#000000',
    flex: 1,
  },
  latexContainer: {
    marginVertical: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 97, 218, 0.2)',
  },
  // 오답노트 저장 모달 스타일
  incorrectNotesModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    padding: 14,
    margin: 20,
    width: 341,
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  incorrectNotesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingHorizontal: 8,
  },
  incorrectNotesModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 22,
    flex: 1,
  },
  incorrectNotesModalQuestion: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 25.5,
    marginBottom: 20,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  incorrectNotesModalButtons: {
    gap: 10,
    paddingHorizontal: 0,
  },
  incorrectNotesModalButton: {
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 채팅 종료 확인 모달 스타일
  exitChatModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    padding: 14,
    margin: 20,
    width: 341,
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  exitChatModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingHorizontal: 8,
  },
  exitChatModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 22,
    flex: 1,
  },
  exitChatModalQuestion: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000000',
    letterSpacing: -0.43,
    lineHeight: 25.5,
    marginBottom: 20,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  exitChatModalButtons: {
    gap: 10,
    paddingHorizontal: 0,
  },
  exitChatModalButton: {
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 토스트 알림 스타일
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#4A4A4A',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
    textAlign: 'center',
  },
  // 챗봇 로딩 애니메이션 스타일
  chatbotLoadingContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#999999',
    marginHorizontal: 2,
    opacity: 0.4,
  },
});

