import { api } from "./http";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ENV } from "./env";

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface SuccessResponse<T> {
  message: string;
  data: T;
  timestamp: string;
}

export interface TokenRes {
  access: string;
  refresh: string;
  name: string;
  email: string;
}

export interface UserInfo {
  name: string;
  email: string;
}

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

async function removeStorageItem(key: string): Promise<void> {
  if (ENV.IS_WEB) {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// 플랫폼별 스토리지에 안전하게 저장하는 유틸리티 함수
async function safeStorageSet(key: string, value: any): Promise<void> {
  try {
    if (value === null || value === undefined) {
      throw new Error(`Cannot store null/undefined value for key: ${key}`);
    }
    
    // 문자열이 아닌 값은 저장하지 않음 (토큰은 항상 문자열이어야 함)
    if (typeof value !== 'string') {
      throw new Error(`Invalid token type for key ${key}: expected string, got ${typeof value}`);
    }
    
    // 토큰을 JSON 문자열로 저장
    await setStorageItem(key, JSON.stringify(value));
    console.log(`토큰 저장 성공: ${key}`);
  } catch (error: any) {
    console.error(`스토리지 저장 오류 (${key}):`, error);
    throw new Error(`스토리지 저장 실패: ${error?.message || '알 수 없는 오류'}`);
  }
}

export async function register(data: RegisterData): Promise<SuccessResponse<string>> {
  try {
    console.log("회원가입 요청 시작:", data.email);
    const response = await api.post("/auth/register", data);
    const responseData = response.data;
    
    console.log("회원가입 응답 원본:", responseData);
    
    // 회원가입 성공 시 사용자 정보 저장
    if (responseData && responseData.message) {
      const userInfo: UserInfo = {
        name: data.name,
        email: data.email
      };
      await storeUserInfo(userInfo);
    }
    
    // 응답 데이터 검증 및 안전한 처리
    if (responseData && typeof responseData === 'object') {
      return {
        message: responseData.message || "회원가입이 완료되었습니다",
        data: responseData.data || "SUCCESS",
        timestamp: responseData.timestamp || new Date().toISOString()
      };
    }
    
    // 응답이 예상과 다른 경우 기본값 반환
    return {
      message: "회원가입이 완료되었습니다",
      data: "SUCCESS",
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    console.error("회원가입 오류:", error);
    
    // 네트워크 오류 처리
    if (error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR') {
      throw new Error('네트워크 연결을 확인해주세요');
    }
    
    // HTTP 상태 코드별 처리
    if (error.response?.status === 409) {
      throw new Error('이미 존재하는 이메일입니다');
    } else if (error.response?.status === 400) {
      throw new Error('입력 정보를 확인해주세요');
    }
    
    throw error;
  }
}

export async function login(email: string, password: string): Promise<SuccessResponse<TokenRes>> {
  try {
    console.log("로그인 요청 시작:", email);
    const response = await api.post("/auth/login", { 
      email, 
      password, 
      deviceId: ENV.DEVICE_ID,
      platform: ENV.PLATFORM 
    });
    const result: SuccessResponse<TokenRes> = response.data;
    
    console.log("로그인 응답 원본:", result);
    
    // 응답 데이터 검증
    if (!result || !result.data) {
      throw new Error("로그인 응답 데이터가 올바르지 않습니다");
    }
    
    // 토큰 검증 및 저장
    const { access, refresh, name, email: userEmail } = result.data;
    
    if (!access || !refresh || typeof access !== 'string' || typeof refresh !== 'string') {
      throw new Error("토큰이 올바르지 않습니다");
    }
    
    // 스토리지에 토큰 안전하게 저장
    await safeStorageSet("access", access);
    await safeStorageSet("refresh", refresh);
    
    // 사용자 정보 저장
    console.log("🔍 로그인 응답에서 받은 사용자 정보:");
    console.log("  - name:", name, "(타입:", typeof name, ")");
    console.log("  - userEmail:", userEmail, "(타입:", typeof userEmail, ")");
    console.log("  - name이 truthy인가?", !!name);
    console.log("  - userEmail이 truthy인가?", !!userEmail);
    
    if (name && userEmail) {
      const userInfo: UserInfo = { name, email: userEmail };
      console.log("💾 저장할 사용자 정보:", userInfo);
      console.log("💾 JSON.stringify 결과:", JSON.stringify(userInfo));
      await storeUserInfo(userInfo);
      console.log("✅ 사용자 정보 저장 완료");
    } else {
      console.warn("❌ 사용자 정보가 불완전합니다:");
      console.warn("  - name:", name);
      console.warn("  - userEmail:", userEmail);
    }
    
    console.log("토큰 및 사용자 정보 저장 완료");
    
    return result;
  } catch (error: any) {
    // console.error("로그인 오류:", error);
    
    // 네트워크 오류 처리
    if (error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR') {
      throw new Error('네트워크 연결을 확인해주세요');
    }
    
    // HTTP 상태 코드별 처리
    if (error.response?.status === 401) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    } else if (error.response?.status === 400) {
      throw new Error('입력 정보를 확인해주세요');
    }
    
    throw error;
  }
}

// 사용자 정보 저장
export async function storeUserInfo(userInfo: UserInfo): Promise<void> {
  try {
    console.log("🔄 storeUserInfo 함수 호출됨");
    console.log("🔄 저장할 userInfo:", userInfo);
    console.log("🔄 userInfo.name:", userInfo?.name);
    console.log("🔄 userInfo.email:", userInfo?.email);
    
    const jsonString = JSON.stringify(userInfo);
    console.log("🔄 JSON.stringify 결과:", jsonString);
    
    await safeStorageSet("user_info", jsonString);
    console.log("✅ safeStorageSet 호출 완료");
    
    // 저장 후 바로 확인
    const stored = await getStorageItem("user_info");
    console.log("🔍 저장 직후 확인:", stored);
    
    console.log("✅ 사용자 정보 저장 완료:", userInfo);
  } catch (error) {
    console.error("❌ 사용자 정보 저장 오류:", error);
    throw error;
  }
}

// 사용자 정보 조회
export async function getUserInfo(): Promise<UserInfo | null> {
  try {
    console.log("🔍 스토리지에서 user_info 조회 중...");
    const userInfoStr = await getStorageItem("user_info");
    console.log("📦 스토리지에서 가져온 원본 데이터:", userInfoStr);
    console.log("📦 데이터 타입:", typeof userInfoStr);
    console.log("📦 데이터 길이:", userInfoStr?.length);
    
    if (!userInfoStr) {
      console.log("❌ 저장된 사용자 정보가 없습니다");
      return null;
    }
    
    console.log("🔄 JSON 파싱 시도...");
    let userInfo = JSON.parse(userInfoStr);
    console.log("✅ 1차 파싱 결과:", userInfo);
    console.log("✅ 1차 파싱 타입:", typeof userInfo);
    
    // 만약 파싱 결과가 문자열이면 한 번 더 파싱
    if (typeof userInfo === 'string') {
      console.log("🔄 이중 JSON 파싱 필요, 2차 파싱 시도...");
      userInfo = JSON.parse(userInfo);
      console.log("✅ 2차 파싱 결과:", userInfo);
    }
    
    console.log("✅ 최종 userInfo.name:", userInfo?.name);
    console.log("✅ 최종 userInfo.email:", userInfo?.email);
    
    return userInfo;
  } catch (error) {
    console.error("❌ 사용자 정보 조회 오류:", error);
    return null;
  }
}

// 스토리지 데이터 초기화 (잘못된 형식의 데이터 정리)
export async function clearSecureStore() {
  try {
    await removeStorageItem("access");
    await removeStorageItem("refresh");
    await removeStorageItem("user_info");
    console.log("스토리지 초기화 완료");
  } catch (error) {
    console.error("스토리지 초기화 오류:", error);
  }
}

export async function logout() {
  try {
    console.log("로그아웃 시작");
    const rt = await getStorageItem("refresh");
    if (rt) {
      // JSON 파싱하여 실제 토큰 값 추출
      let refreshToken;
      try {
        refreshToken = JSON.parse(rt);
      } catch {
        // 파싱 실패 시 원본 값 사용
        refreshToken = rt;
      }
      
      console.log("로그아웃 요청 전송 중...");
      await api.post("/auth/logout", { refresh: refreshToken });
      console.log("로그아웃 요청 완료");
    } else {
      console.log("리프레시 토큰이 없어서 API 호출 생략");
    }
  } catch (error: any) {
    console.error("로그아웃 API 호출 오류:", error);
    
    // 네트워크 오류는 무시 (로컬 토큰 삭제는 계속 진행)
    if (error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR') {
      console.log("네트워크 오류로 인한 로그아웃 API 호출 실패, 로컬 토큰만 삭제");
    }
    
    // API 호출 실패해도 로컬 토큰은 삭제
  } finally {
    // 토큰 삭제는 항상 실행
    console.log("로컬 토큰 삭제 중...");
    await clearSecureStore();
    console.log("로그아웃 완료");
  }
}

// 토큰 조회 함수 추가
export async function getAccessToken(): Promise<string | null> {
  try {
    const token = await getStorageItem("access");
    if (!token) return null;
    
    // JSON 파싱 시도
    try {
      return JSON.parse(token);
    } catch {
      // 파싱 실패 시 원본 값 반환 (이전 버전과의 호환성)
      return token;
    }
  } catch (error) {
    console.error("액세스 토큰 조회 오류:", error);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    const token = await getStorageItem("refresh");
    if (!token) return null;
    
    // JSON 파싱 시도
    try {
      return JSON.parse(token);
    } catch {
      // 파싱 실패 시 원본 값 반환 (이전 버전과의 호환성)
      return token;
    }
  } catch (error) {
    console.error("리프레시 토큰 조회 오류:", error);
    return null;
  }
}