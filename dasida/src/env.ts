import { Platform } from 'react-native';

// 플랫폼별 기본 설정
const getDefaultAPI = () => {
  if (Platform.OS === 'web') {
    // 웹에서는 상대 경로 사용
    return window.location.origin;
  }
  // 모바일/태블릿에서는 절대 URL 사용
  return "http://52.79.233.106";
};

const getDefaultWS = () => {
  if (Platform.OS === 'web') {
    // 웹에서는 현재 도메인의 WebSocket 사용
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  // 모바일/태블릿에서는 절대 URL 사용
  return "ws://52.79.233.106";
};

export const ENV = {
  API: process.env.EXPO_PUBLIC_API_URL ?? getDefaultAPI(),
  WS: process.env.EXPO_PUBLIC_WS_URL ?? getDefaultWS(),
  
  // 플랫폼 정보
  PLATFORM: Platform.OS,
  IS_WEB: Platform.OS === 'web',
  IS_MOBILE: Platform.OS === 'ios' || Platform.OS === 'android',
  
  // 디바이스 정보
  DEVICE_ID: Platform.OS, // 실제로는 더 정교한 디바이스 ID 사용 권장
};

