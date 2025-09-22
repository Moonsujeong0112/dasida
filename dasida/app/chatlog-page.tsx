import { StyleSheet, ScrollView, TouchableOpacity, TextInput, View, Image, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getUserInfo, getAccessToken, storeUserInfo } from '@/src/auth';

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

interface UserInfo {
  name: string;
  email: string;
}

interface ChatMessage {
  id: string;
  sender_role: 'user' | 'dasida';
  message: string;
  timestamp: string;
}

interface ProblemInfo {
  id: string;
  problem_number: string;
  problem_text: string;
  book_name: string;
  page_number: string;
  tags: string[];
  difficulty: string;
  problem_type: string;
  image_url?: string;
}

export default function ChatLogPage() {
  const colorScheme = useColorScheme();
  const colors = Colors.light;
  const router = useRouter();
  const params = useLocalSearchParams();
  const conversationId = params.conversationId as string;
  const problemId = params.problemId as string;
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [problemInfo, setProblemInfo] = useState<ProblemInfo | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [problemImage, setProblemImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  // 사용자 정보 로드 함수
  const loadUserInfo = async () => {
    try {
      console.log("=== 사용자 정보 로딩 시작 ===");
      const info = await getUserInfo();
      console.log("getUserInfo() 결과:", info);
      
      if (info) {
        console.log("사용자 정보 존재, 상태 업데이트 중...");
        setUserInfo(info);
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
      const token = await getAccessToken();
      if (token) {
        console.log("토큰으로 사용자 정보 API 호출");
        
        const response = await fetch('http://52.79.233.106/api/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const apiResponse = await response.json();
          console.log("API에서 받은 응답:", apiResponse);
          
          const userData = apiResponse.data;
          const userInfo = {
            name: userData.name,
            email: userData.email
          };
          
          console.log("추출된 사용자 정보:", userInfo);
          setUserInfo(userInfo);
          await storeUserInfo(userInfo);
        } else {
          console.error("API 호출 실패:", response.status);
        }
      }
    } catch (error) {
      console.error("사용자 정보 API 조회 실패:", error);
    }
  };

  // 문제 정보 로드
  const loadProblemInfo = async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        console.error("토큰이 없습니다");
        return;
      }

      console.log("문제 정보 조회:", conversationId);
      
      const response = await fetch(`http://52.79.233.106/fastapi/conversations/${conversationId}/report`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // console.log("문제 정보 데이터:", data);
        // console.log("=== DB 필드 확인 ===");
        // console.log("p_id 필드:", data.p_id);
        // console.log("book_id 필드:", data.book_id);
        // console.log("p_code 필드:", data.p_code);
        // console.log("p_text 필드:", data.p_text);
        // console.log("p_name 필드:", data.p_name);
        // console.log("p_page 필드:", data.p_page);
        // console.log("num_in_page 필드:", data.num_in_page);
        // console.log("p_img_url 필드:", data.p_img_url);
        // console.log("main_chapt 필드:", data.main_chapt);
        // console.log("sub_chapt 필드:", data.sub_chapt);
        // console.log("p_type 필드:", data.p_type);
        // console.log("p_level 필드:", data.p_level);
        // console.log("conversation_id 필드:", data.conversation_id);
        // console.log("=== 전체 데이터 키 목록 ===");
        // console.log("사용 가능한 키들:", Object.keys(data));
        
        // 문제 정보 설정 (num_in_page 사용)
        const problem: ProblemInfo = {
          id: data.p_id || data.conversation_id || conversationId,
          problem_number: data.num_in_page || data.p_code || '',
          problem_text: data.p_text || "문제 내용을 불러올 수 없습니다.",
          book_name: data.p_name || "유형체크N제",
          page_number: data.p_page || '',
          tags: [
            data.main_chapt,
            data.sub_chapt,
            data.p_type,
            data.p_level
          ].filter(Boolean), // null/undefined 제거
          difficulty: data.p_level || '중',
          problem_type: data.p_type || '주관식',
          image_url: data.p_img_url
        };
        
        // console.log("설정된 문제 정보:", problem);
        setProblemInfo(problem);
        
        // 문제 이미지 로드 (num_in_page 사용)
        if (data.num_in_page) {
          const problemId = String(data.num_in_page).padStart(4, '0');
          console.log(`이미지 로드용 problemId: ${problemId} (원본: ${data.num_in_page})`);
          loadProblemImage(problemId, data.p_img_url);
        }
      } else {
        console.error("문제 정보 조회 실패:", response.status);
        const errorText = await response.text();
        console.error("에러 응답:", errorText);
      }
    } catch (error) {
      console.error("문제 정보 로딩 오류:", error);
    }
  };

  // 문제 이미지 로드 함수 (chat-save.tsx와 동일)
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
          
          // console.log('🔄 문제 이미지 URL 시도 중:', absoluteUrl);
          const response = await fetch(absoluteUrl, { method: 'HEAD' });
          console.log('📡 응답 상태:', response.status, response.statusText);
          
          if (response.ok) {
            // console.log('✅ 문제 이미지 URL 성공:', absoluteUrl);
            setProblemImage(absoluteUrl);
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
      // console.log('💥 모든 URL 시도 실패. 기본 이미지 사용');
      // setProblemImage('https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image');
      
    } catch (err) {
      console.error("🔥 문제 이미지 로드 실패:", err);
      // 에러 시에도 기본 이미지 사용
      // setProblemImage('https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image');
    }
  };

  // 채팅 내역 로드
  const loadChatHistory = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) {
        console.error("토큰이 없습니다");
        return;
      }

      // console.log("채팅 내역 조회:", conversationId);
      
      const response = await fetch(`http://52.79.233.106/fastapi/conversations/${conversationId}/report`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // console.log("채팅 내역 데이터:", data);
        
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
      setLoading(false);
    }
  };

  // 메시지 전송
  const sendMessage = async () => {
    if (!userInput.trim() || sending) return;
    
    // 미지원 서비스 알럿 표시
    alert('[미지원 서비스]\n서비스 개발 진행 중입니다.');
    return;
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender_role: 'user',
      message: userInput,
      timestamp: new Date().toISOString()
    };
    
    try {
      setSending(true);
      const token = await getAccessToken();
      if (!token) {
        console.error("토큰이 없습니다");
        return;
      }

      // 로컬에서 즉시 메시지 추가
      setChatMessages(prev => [...prev, newMessage]);
      setUserInput('');

      // 서버에 메시지 전송
      const response = await fetch(`http://52.79.233.106/fastapi/conversations/${conversationId}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userInput
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log("AI 응답:", data);
        
        // AI 응답 추가
        if (data.response) {
          const aiMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender_role: 'dasida',
            message: data.response,
            timestamp: new Date().toISOString()
          };
          setChatMessages(prev => [...prev, aiMessage]);
        }
      } else {
        console.error("메시지 전송 실패:", response.status);
        // 에러 시 사용자 메시지 제거
        setChatMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
      }
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      // 에러 시 사용자 메시지 제거
      setChatMessages(prev => prev.filter(msg => msg.id !== newMessage.id));
    } finally {
      setSending(false);
    }
  };

  // 채팅 스크롤을 맨 아래로 이동
  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // 새 메시지가 추가될 때마다 스크롤
  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages]);

  useEffect(() => {
    loadUserInfo();
    loadProblemInfo();
    loadChatHistory();
  }, [conversationId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
          <ThemedText style={styles.headerTitle}>
            {problemInfo ? `${problemInfo.book_name} p.${problemInfo.page_number} ${problemInfo.problem_number}번` : '문제 로딩 중...'}
          </ThemedText>
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

        {/* 교재 정보 및 해시태그 섹션 */}
        {problemInfo && (
          <View style={styles.tagsSection}>
            <View style={styles.tagsContainer}>
              {/* 교재 이름 */}
              <View style={styles.hashtagContainer}>
                <ThemedText style={styles.hashtagText}>#체크체크{problemInfo.book_name}</ThemedText>
              </View>
              
              {/* 페이지 및 문제 번호 */}
              <View style={styles.hashtagContainer}>
                <ThemedText style={styles.hashtagText}>#p.{problemInfo.page_number}[{problemInfo.problem_number}번]</ThemedText>
              </View>
              {/* 페이지 및 문제 번호 */}
              <View style={styles.hashtagContainer}>
                <ThemedText style={styles.hashtagText}>#중1-1</ThemedText>
              </View>
              
              {/* 단원 정보 */}
              {problemInfo.tags.length > 0 && (
                <>
                  {problemInfo.tags.map((tag, index) => (
                    <View key={`tag-${tag}-${index}`} style={styles.hashtagContainer}>
                      <ThemedText style={styles.hashtagText}>#{tag}</ThemedText>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        )}

        {/* 문제 박스 */}
        {problemInfo && (
          <View style={styles.problemBox}>
            {/* <View style={styles.problemHeader}>
              <ThemedText style={styles.problemId}>[{problemInfo.problem_number}]</ThemedText>
            </View> */}
            <View style={styles.problemImageContainer}>
              {problemImage ? (
                <TouchableOpacity 
                  onPress={() => setShowImageModal(true)}
                  style={styles.imageTouchable}
                >
                  <Image
                    source={{ uri: problemImage }}
                    style={styles.problemImage}
                    resizeMode="contain"
                    onError={() => {
                      console.error("문제 이미지 로드 실패:", problemImage);
                      // 에러 시 기본 이미지로 설정
                      setProblemImage('https://via.placeholder.com/300x150/4A90E2/FFFFFF?text=Problem+Image');
                    }}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.imagePlaceholder}>
                  <IconSymbol name="doc.text" size={32} color="#E5E5E5" />
                  <ThemedText style={styles.placeholderText}>이미지 로딩 중...</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 채팅 내역 */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.chatContainer} 
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ThemedText>채팅 내역을 불러오는 중...</ThemedText>
            </View>
          ) : chatMessages.length > 0 ? (
            chatMessages.map((message, index) => (
              <View key={`${message.id}-${index}`} style={[
                styles.messageContainer,
                message.sender_role === 'user' ? styles.userMessage : styles.botMessage
              ]}>
                {message.sender_role === 'dasida' && (
                  <View style={styles.messageAvatar}>
                    <Image 
                      source={require('@/assets/images/maesaen0.8.png')} 
                      style={styles.messageAvatarImage}
                    />
                  </View>
                )}
                {message.sender_role === 'dasida' ? (
                  <View style={styles.messageContent}>
                    <ThemedText style={styles.aiName}>매쓰천재</ThemedText>
                    <View style={[
                      styles.messageBubble,
                      styles.botBubble
                    ]}>
                      <ThemedText style={[
                        styles.messageText,
                        styles.botText
                      ]}>
                        {removeMetadataFromMessage(message.message)}
                      </ThemedText>
                    </View>
                  </View>
                ) : (
                  <View style={[
                    styles.messageBubble,
                    styles.userBubble
                  ]}>
                    <ThemedText style={[
                      styles.messageText,
                      styles.userText
                    ]}>
                      {removeMetadataFromMessage(message.message)}
                    </ThemedText>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>채팅 내역이 없습니다.</ThemedText>
            </View>
          )}
        </ScrollView>

        {/* 사용자 입력 필드 */}
        <View style={styles.inputContainer}>
          <View style={styles.inputFieldContainer}>
            <TextInput
              style={styles.inputField}
              placeholder="내용을 입력해 주세요"
              placeholderTextColor="#BEBEBE"
              value={userInput}
              onChangeText={setUserInput}
              multiline
              editable={!sending}
            />
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={sendMessage}
              disabled={sending}
            >
              <Image 
                source={require('@/assets/images/send.png')} 
                style={styles.sendButtonImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 이미지 확대 모달 */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.closeModalButton}
              onPress={() => setShowImageModal(false)}
            >
              <Image source={require('@/assets/images/close.png')} 
              style={styles.closeModalButtonIcon} 
              />
            </TouchableOpacity>
            {problemImage && (
              <Image
                source={{ uri: problemImage }}
                style={styles.expandedImage}
                resizeMode="contain"
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffff',
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
    fontSize: 22,
    fontWeight: '500',
    flex: 1,
    alignItems: 'flex-start',
  },
  closeModalButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  addButton: {
    padding: 8,
  },
  addButtonImage: {
    width: 40,
    height: 40,
  },
  headerIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  tagsSection: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hashtagContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hashtagText: {
    fontFamily: 'Inter',
    fontStyle: 'normal',
    fontWeight: '400',
    fontSize: 20,
    lineHeight: 22,
    color: '#3861DA',
  },
  problemBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3861DA',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  problemHeader: {
    marginBottom: 12,
  },
  problemId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  problemText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 12,
  },
  problemImageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    height: 200,
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
  chatContainer: {
    backgroundColor: '#F5F5F5',
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: 30,
    borderTopWidth: 2,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
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
  messageContent: {
    flex: 1,
    flexDirection: 'column',
  },
  aiName: {
    fontSize: 17,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginLeft: 4,
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
  botText: {
    color: '#2C3E50',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F5F5',
  },
  inputFieldContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 50,
  },
  inputField: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.43,
    lineHeight: 20,
    color: '#000000',
    textAlignVertical: 'bottom',
    maxHeight: 100,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonImage: {
    width: 20,
    height: 20,
  },
  imageTouchable: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    position: 'relative',
  },
  closeModalButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
  },
  expandedImage: {
    width: '100%',
    height: '100%',
  },
});
