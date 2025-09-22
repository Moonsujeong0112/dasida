import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { ENV } from "./env";

// 플랫폼별 스토리지 유틸리티
async function getStorageItem(key: string): Promise<string | null> {
  if (ENV.IS_WEB) {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
}

async function setStorageItem(key: string, value: string): Promise<void> {
  if (ENV.IS_WEB) {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export const api = axios.create({ 
  baseURL: `${ENV.API}/api`,
  timeout: 30000, // 30초 타임아웃
  headers: {
    'Content-Type': 'application/json',
  },
  // 네트워크 오류 방지를 위한 추가 설정
  validateStatus: function (status) {
    return status >= 200 && status < 300; // 기본값
  },
  // 요청 재시도 설정
  retry: 3,
  retryDelay: 1000,
});

// 스토리지에서 안전하게 토큰 조회
async function getStoredToken(key: string): Promise<string | null> {
  try {
    const token = await getStorageItem(key);
    if (!token) return null;
    
    // JSON 파싱 시도
    try {
      return JSON.parse(token);
    } catch {
      // 파싱 실패 시 원본 값 반환 (이전 버전과의 호환성)
      return token;
    }
  } catch (error) {
    console.error(`토큰 조회 오류 (${key}):`, error);
    return null;
  }
}

// 스토리지에 안전하게 토큰 저장
async function storeToken(key: string, value: string): Promise<void> {
  try {
    if (!value || typeof value !== 'string') {
      throw new Error(`Invalid token value for key: ${key}`);
    }
    await setStorageItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`토큰 저장 오류 (${key}):`, error);
    throw error;
  }
}

api.interceptors.request.use(async (cfg) => {
  const at = await getStoredToken("access");
  if (at) cfg.headers.Authorization = `Bearer ${at}`;
  return cfg;
});

let refreshing = false;
let queue: ((t?: string)=>void)[] = [];

api.interceptors.response.use(undefined, async (err) => {
  const { config, response } = err;
  
  // 네트워크 오류 처리 (서버 연결 실패 등)
  if (!response && err.code === 'NETWORK_ERROR') {
    console.error('네트워크 오류:', err.message);
    throw new Error('네트워크 연결을 확인해주세요');
  }
  
  if (response?.status === 401 && !config._retry) {
    (config as any)._retry = true;

    if (!refreshing) {
      refreshing = true;
      const rt = await getStoredToken("refresh");
      
      if (!rt) {
        // 리프레시 토큰이 없으면 로그아웃 처리
        refreshing = false;
        queue.forEach(fn => fn());
        queue = [];
        throw new Error("로그인정보를 다시 확인해주세요.");
      }
      
      try {
        console.log("토큰 갱신 시도 중...");
        const { data } = await axios.post(`${ENV.API}/api/auth/refresh`, { refresh: rt });
        
        if (data && data.data) {
          const { access, refresh: newRefresh } = data.data;
          await storeToken("access", access);
          await storeToken("refresh", newRefresh);
          queue.forEach(fn => fn(access));
          console.log("토큰 갱신 성공");
        } else {
          throw new Error("토큰 갱신 응답이 올바르지 않습니다");
        }
      } catch (refreshError) {
        console.error("토큰 갱신 실패:", refreshError);
        // 갱신 실패 시 로그아웃 처리
        queue.forEach(fn => fn());
        queue = [];
        throw new Error("세션이 만료되었습니다. 다시 로그인해주세요");
      } finally {
        refreshing = false;
        queue = [];
      }
    }

    return new Promise(resolve => {
      queue.push((newAT) => {
        if (newAT) {
          (config.headers ||= {}).Authorization = `Bearer ${newAT}`;
          resolve(api(config));
        } else {
          // 토큰 갱신 실패 시 에러 반환
          resolve(Promise.reject(new Error("인증이 필요합니다")));
        }
      });
    });
  }
  throw err;
});
