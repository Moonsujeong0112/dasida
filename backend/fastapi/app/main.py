from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from jwt import PyJWKClient, decode
from fastapi.encoders import jsonable_encoder
import os
import json
import time
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai
from typing import Optional, List, Dict, Any

# 로컬 모듈 import
from .database import db_manager, DB_HOST, DB_NAME, logger
from .services import ProblemService, ChatService, ReportService
from .prompt_engineering import PromptEngineeringService
from .chat_service import ChatMessageRequest, ChatResponse, ConversationRequest, ConversationReport

# .env 파일 로드
load_dotenv()

ISSUER = os.getenv("ISSUER", "http://52.79.233.106")
JWKS_URL = os.getenv("JWKS_URL", f"{ISSUER}/.well-known/jwks.json")
jwk_client = PyJWKClient(JWKS_URL)

# Gemini API 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
PROVIDER = os.getenv("PROVIDER", "gemini")

# 토큰 사용량 추적 파일
USAGE_FILE = "app/api_tot_usage.json"

# Gemini API 초기화
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)
else:
    model = None
    print("Warning: GEMINI_API_KEY not found in environment variables")

def load_usage_data():
    """사용량 데이터를 로드합니다."""
    try:
        if os.path.exists(USAGE_FILE):
            with open(USAGE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"사용량 데이터 로드 오류: {e}")
    return {"total_requests": 0, "total_tokens": 0, "requests": []}

def save_usage_data(usage_data):
    """사용량 데이터를 저장합니다."""
    try:
        with open(USAGE_FILE, 'w', encoding='utf-8') as f:
            json.dump(usage_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"사용량 데이터 저장 오류: {e}")

def count_tokens(text: str) -> int:
    """텍스트의 토큰 수를 계산합니다."""
    if not model:
        return 0
    try:
        return model.count_tokens(text).total_tokens
    except Exception as e:
        print(f"토큰 계산 오류: {e}")
        # fallback: 대략적인 계산 (1 토큰 ≈ 4 문자)
        return len(text) // 4

def log_token_usage(prompt_tokens, response_tokens, total_tokens, model_name, request_type="chat"):
    """토큰 사용량을 로그하고 저장합니다."""
    timestamp = datetime.now().isoformat()
    
    # 사용량 데이터 로드
    usage_data = load_usage_data()
    
    # 새로운 요청 정보
    request_info = {
        "timestamp": timestamp,
        "request_type": request_type,
        "model": model_name,
        "prompt_tokens": prompt_tokens,
        "response_tokens": response_tokens,
        "total_tokens": total_tokens
    }
    
    # 사용량 데이터 업데이트
    usage_data["total_requests"] += 1
    usage_data["total_tokens"] += total_tokens
    usage_data["requests"].append(request_info)
    
    # 저장
    save_usage_data(usage_data)
    
    # 로그 출력
    print(f"[{timestamp}] API 사용량 - 모델: {model_name}, 프롬프트: {prompt_tokens}, 응답: {response_tokens}, 총: {total_tokens} 토큰")
    print(f"[{timestamp}] 누적 사용량 - 총 요청: {usage_data['total_requests']}, 총 토큰: {usage_data['total_tokens']}")

def verify_access(token: str):
    key = jwk_client.get_signing_key_from_jwt(token).key
    return decode(token, key, algorithms=["RS256"], issuer=ISSUER)

async def get_gemini_response(prompt: str) -> str:
    """Gemini API를 사용하여 응답을 생성합니다."""
    if not model:
        return "Gemini API가 설정되지 않았습니다. API 키를 확인해주세요."
    
    try:
        start_time = time.time()
        
        # 프롬프트 토큰 수 계산
        prompt_tokens = count_tokens(prompt)
        
        # 응답 생성
        response = model.generate_content(prompt)
        end_time = time.time()
        
        # 응답 토큰 수 계산 (usage_metadata 사용)
        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            total_tokens = response.usage_metadata.total_token_count
            response_tokens = total_tokens - prompt_tokens
        else:
            # fallback: 응답 텍스트의 토큰 수 계산
            response_tokens = count_tokens(response.text)
            total_tokens = prompt_tokens + response_tokens
        
        # 사용량 로그
        log_token_usage(prompt_tokens, response_tokens, total_tokens, GEMINI_MODEL)
        
        return response.text
    except Exception as e:
        print(f"Gemini API 오류: {e}")
        # API 키 오류인 경우 테스트용 응답 반환
        if "API key not valid" in str(e) or "API_KEY_INVALID" in str(e):
            return f"테스트 모드: '{prompt}'에 대한 AI 응답입니다. (실제 API 키가 필요합니다)"
        return f"AI 응답 생성 중 오류가 발생했습니다: {str(e)}"

app = FastAPI(title="Dasida FastAPI", description="LLM 모델을 위한 FastAPI 서버")

# 정적 파일 서빙 설정
import os
# 도커 환경에서는 /app 디렉토리 내에서 실행되므로 절대 경로 사용
static_dir = "/app/static/uploads"
app.mount("/uploads", StaticFiles(directory=static_dir), name="uploads")

@app.get("/")
async def root():
    return {"message": "Dasida FastAPI 서버가 실행 중입니다!", "status": "running", "provider": PROVIDER, "model": GEMINI_MODEL}

@app.get("/health")
async def health_check():
    gemini_status = "configured" if model else "not_configured"
    usage_data = load_usage_data()
    return {
        "status": "healthy", 
        "service": "dasida-fastapi", 
        "gemini": gemini_status,
        "usage": {
            "total_requests": usage_data["total_requests"],
            "total_tokens": usage_data["total_tokens"]
        }
    }

@app.get("/test")
async def test_endpoint():
    return {"message": "테스트 엔드포인트가 정상 작동합니다!", "timestamp": "2024", "provider": PROVIDER}

@app.get("/usage")
async def get_usage_stats():
    """API 사용량 통계를 반환합니다."""
    usage_data = load_usage_data()
    return {
        "total_requests": usage_data["total_requests"],
        "total_tokens": usage_data["total_tokens"],
        "recent_requests": usage_data["requests"][-10:] if usage_data["requests"] else []
    }

@app.post("/count-tokens")
async def count_tokens_endpoint(text: dict):
    """텍스트의 토큰 수를 계산합니다."""
    input_text = text.get("text", "")
    if not input_text:
        return {"error": "텍스트가 필요합니다."}
    
    token_count = count_tokens(input_text)
    return {
        "text": input_text,
        "token_count": token_count,
        "model": GEMINI_MODEL
    }

# 채팅 메시지 저장 및 관리 API
@app.post("/chat/save", response_model=ChatResponse)
async def save_chat_message(request: ChatMessageRequest):
    """채팅 메시지를 저장하고 AI 응답을 반환합니다."""
    try:
        # 대화 세션이 없으면 새로 생성
        conversation_id = request.conversation_id
        if not conversation_id:
            conversation_id = ChatService.create_conversation(request.user_id, request.p_id)
        
        # 메시지 저장
        chat_id = ChatService.save_chat_message(
            conversation_id=conversation_id,
            user_id=request.user_id,
            p_id=request.p_id,
            sender_role=request.sender_role,
            message=request.message,
            message_type=request.message_type
        )
        
        # AI 응답 생성 (사용자 메시지인 경우에만)
        if request.sender_role == "user":
            # ai_response = await get_gemini_response(request.message)
            
            # AI 응답 저장
            ai_chat_id = ChatService.save_chat_message(
                conversation_id=conversation_id,
                user_id=request.user_id,
                p_id=request.p_id,
                sender_role="dasida",
                message=ai_response,
                message_type="text"
            )
            
            return ChatResponse(
                message=ai_response,
                conversation_id=conversation_id,
                chat_id=ai_chat_id,
                provider=PROVIDER,
                model=GEMINI_MODEL
            )
        else:
            # AI 메시지나 시스템 메시지인 경우 응답 없이 저장만
            return ChatResponse(
                message=request.message,
                conversation_id=conversation_id,
                chat_id=chat_id,
                provider=PROVIDER,
                model=GEMINI_MODEL
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"채팅 메시지 저장 실패: {str(e)}")

@app.post("/conversation/create")
async def create_conversation(request: ConversationRequest):
    """새로운 대화 세션을 생성합니다."""
    try:
        # 1. 요청 바디 파라미터 검증 및 로깅
        logger.info(f"대화 세션 생성 요청 시작: {request}")
        logger.info(f"요청 파라미터 - user_id: {request.user_id}, p_id: {request.p_id}")
        
        # 2. 필수 파라미터 검증
        if not request.user_id or request.user_id <= 0:
            logger.error(f"잘못된 user_id: {request.user_id}")
            raise HTTPException(status_code=400, detail="유효하지 않은 user_id입니다.")
        
        if not request.p_id or request.p_id <= 0 or request.p_id == 1:
            logger.error(f"잘못된 p_id: {request.p_id}")
            raise HTTPException(status_code=400, detail=f"유효하지 않은 p_id입니다. p_id는 1,002,001 이상이어야 합니다. (받은 값: {request.p_id})")
        
        # 3. 대화 세션 생성
        logger.info(f"대화 세션 생성 시작: user_id={request.user_id}, p_id={request.p_id}")
        try:
            conversation_id = ChatService.create_conversation(request.user_id, request.p_id)
            logger.info(f"대화 세션 생성 완료: {conversation_id}")
        except Exception as e:
            logger.error(f"대화 세션 생성 실패: {e}")
            logger.error(f"오류 타입: {type(e).__name__}")
            logger.error(f"오류 상세: {str(e)}")
            raise HTTPException(status_code=500, detail=f"대화 세션 생성 실패: {str(e)}")
        
        # 4. 응답 반환
        response_data = {
            "conversation_id": conversation_id,
            "user_id": request.user_id,
            "p_id": request.p_id,
            "status": "created"
        }
        logger.info(f"대화 세션 생성 응답: {response_data}")
        return response_data
        
    except HTTPException:
        # HTTPException은 그대로 재발생
        raise
    except Exception as e:
        logger.error(f"대화 세션 생성 중 예상치 못한 오류: {e}")
        logger.error(f"오류 타입: {type(e).__name__}")
        logger.error(f"오류 상세: {str(e)}")
        raise HTTPException(status_code=500, detail=f"대화 세션 생성 실패: {str(e)}")

@app.get("/conversation/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str):
    """대화 세션의 모든 메시지를 조회합니다."""
    try:
        messages = ChatService.get_conversation_messages(conversation_id)
        return {
            "conversation_id": conversation_id,
            "messages": messages,
            "count": len(messages)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"메시지 조회 실패: {str(e)}")

@app.get("/conversation/{conversation_id}/full-chat-log")
async def get_conversation_full_chat_log(conversation_id: str):
    """대화 세션의 전체 채팅 로그를 조회합니다."""
    try:
        conn = db_manager.get_connection()
        with conn.cursor() as cursor:
            query = """
            SELECT full_chat_log, started_at, completed_at
            FROM conversations 
            WHERE conversation_id = %s
            """
            cursor.execute(query, (conversation_id,))
            result = cursor.fetchone()
            
            if result:
                return {
                    "conversation_id": conversation_id,
                    "full_chat_log": result['full_chat_log'],
                    "started_at": result['started_at'],
                    "completed_at": result['completed_at']
                }
            else:
                raise HTTPException(status_code=404, detail="대화 세션을 찾을 수 없습니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"전체 채팅 로그 조회 실패: {str(e)}")

@app.get("/user/{user_id}/conversations")
async def get_user_conversations(user_id: int, limit: int = 10):
    """사용자의 대화 세션 목록을 조회합니다."""
    try:
        conversations = ReportService.get_user_conversations_with_error_patterns(user_id, limit)
        return {
            "user_id": user_id,
            "conversations": conversations,
            "count": len(conversations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"대화 세션 조회 실패: {str(e)}")

@app.get("/user/{user_id}/conversations/basic")
async def get_user_conversations_basic(user_id: int, limit: int = 10):
    """사용자의 기본 대화 세션 목록을 조회합니다 (오답 패턴 없음)."""
    try:
        conversations = ChatService.get_user_conversations(user_id, limit)
        return {
            "user_id": user_id,
            "conversations": conversations,
            "count": len(conversations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"대화 세션 조회 실패: {str(e)}")

@app.post("/conversation/{conversation_id}/complete")
async def complete_conversation(conversation_id: str):
    """대화 세션을 완료 상태로 변경합니다."""
    try:
        success = ChatService.complete_conversation(conversation_id)
        if success:
            return {"conversation_id": conversation_id, "status": "completed"}
        else:
            raise HTTPException(status_code=500, detail="대화 세션 완료 처리 실패")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"대화 세션 완료 실패: {str(e)}")

@app.post("/chat")
async def chat_with_ai(message: dict):
    """AI와 채팅하는 엔드포인트"""
    # message가 문자열인 경우 JSON으로 파싱
    if isinstance(message, str):
        try:
            message = json.loads(message)
        except json.JSONDecodeError:
            return {"error": "잘못된 JSON 형식입니다."}
    
    user_message = message.get("message", "")
    if not user_message:
        return {"error": "메시지가 필요합니다."}
    
    # Gemini API를 사용하여 응답 생성
    ai_response = await get_gemini_response(user_message)
    
    return {
        "message": ai_response,
        "provider": PROVIDER,
        "model": GEMINI_MODEL
    }

@app.websocket("/ws/tutor/{session_id}")
async def tutor(ws: WebSocket, session_id: str):
    token = ws.query_params.get("token") or ws.headers.get("authorization","").replace("Bearer ","")
    if not token:
        return await ws.close(code=4401)
    try:
        claims = verify_access(token)
    except Exception:
        return await ws.close(code=4401)

    await ws.accept()
    try:
        await ws.send_text(f"hello user:{claims['sub']} session:{session_id}")
        while True:
            msg = await ws.receive_text()
            # Gemini API를 사용하여 응답 생성
            ai_response = await get_gemini_response(msg)
            await ws.send_text(ai_response)
    except WebSocketDisconnect:
        pass

@app.post("/ai/your-new-endpoint/{p_id}")
async def your_new_endpoint(p_id: int):
    problem = ProblemService.get_problem_by_id(p_id)
    prompt = PromptEngineeringService.create_your_new_prompt(problem)
    ai_response = await get_gemini_response(prompt)
    return {"response": ai_response}

# ===== 프론트엔드용 프롬프팅 엔지니어링 엔드포인트 =====

@app.post("/ai/problem-solution")
async def get_problem_solution(request: dict):
    """프론트엔드에서 페이지와 문제번호를 받아 AI 풀이를 생성합니다."""
    # request가 문자열인 경우 JSON으로 파싱
    if isinstance(request, str):
        try:
            request = json.loads(request)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="잘못된 JSON 형식입니다.")
    
    page_number = request.get("page_number")
    problem_number = request.get("problem_number")
    solution_type = request.get("solution_type", "step_by_step")  # step_by_step, direct
    
    if not page_number or not problem_number:
        raise HTTPException(status_code=400, detail="페이지 번호와 문제 번호가 필요합니다.")
    
    try:
        # 데이터베이스에서 실제 문제 정보 조회
        problem_data = ProblemService.get_problem_by_page_and_number(int(page_number), str(problem_number))
        
        if not problem_data:
            # 문제를 찾을 수 없는 경우
            raise HTTPException(status_code=404, detail=f"{page_number}페이지 {problem_number}번 문제를 찾을 수 없습니다.")
        
        # 프롬프트 타입에 따라 다른 프롬프트 생성
        if solution_type == "step_by_step":
            prompt = PromptEngineeringService.create_step_by_step_prompt(problem_data)
        elif solution_type == "direct":
            prompt = PromptEngineeringService.create_direct_solution_prompt(problem_data)
        else:
            # 기본값은 단계별 풀이
            prompt = PromptEngineeringService.create_step_by_step_prompt(problem_data)
        
        # AI 응답 생성
        ai_response = await get_gemini_response(prompt)
        
        return {
            "page_number": page_number,
            "problem_number": problem_number,
            "solution_type": solution_type,
            "problem_info": {
                "p_name": problem_data.get("p_name"),
                "main_chapt": problem_data.get("main_chapt"),
                "sub_chapt": problem_data.get("sub_chapt"),
                "p_level": problem_data.get("p_level"),
                "p_type": problem_data.get("p_type"),
                "con_type": problem_data.get("con_type")
            },
            "solution": ai_response,
            "provider": PROVIDER,
            "model": GEMINI_MODEL,
            "token_usage": {
                "prompt_tokens": count_tokens(prompt),
                "response_tokens": count_tokens(ai_response),
                "total_tokens": count_tokens(prompt) + count_tokens(ai_response)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"문제 풀이 생성 오류: {e}")
        raise HTTPException(status_code=500, detail=f"문제 풀이 생성 실패: {e}")

@app.post("/ai/step-by-step-solution")
async def get_step_by_step_solution(request: dict):
    """대화형 단계별 풀이를 위한 전용 엔드포인트"""
    try:
        # request가 문자열인 경우 JSON으로 파싱
        if isinstance(request, str):
            try:
                request = json.loads(request)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="잘못된 JSON 형식입니다.")
        
        # 요청 데이터 추출
        conversation_id = request.get("conversation_id")
        user_message = request.get("user_message", "")
        current_step = request.get("current_step", 1)
        attempts = request.get("attempts", {})
        
        # 첫 번째 시작인 경우 (user_message가 '시작'이거나 conversation_id가 없는 경우)
        if user_message == "시작" or not conversation_id:
            page_number = request.get("page_number")
            problem_number = request.get("problem_number")
            
            if not page_number or not problem_number:
                raise HTTPException(status_code=400, detail="페이지 번호와 문제 번호가 필요합니다.")
            
            # 문제 데이터 조회
            problem_data = ProblemService.get_problem_by_page_and_number(page_number, problem_number)
            if not problem_data:
                raise HTTPException(status_code=404, detail=f"{page_number}페이지 {problem_number}번 문제를 찾을 수 없습니다.")
            
            # 첫 번째 단계 프롬프트 생성
            prompt = PromptEngineeringService.create_step_by_step_prompt(problem_data)
            
            # 대화 컨텍스트 추가
            conversation_context = f"""
현재 대화 상태:
- conversation_id: {conversation_id}
- current_step: 1
- attempts: {{}}
- user_message: "시작"

첫 번째 단계를 시작하세요. 위의 프롬프트 규칙을 따라 첫 번째 단계만 제시하세요.
"""
            
            full_prompt = prompt + "\n\n" + conversation_context
            
        else:
            # 기존 대화 세션에서 대화 계속
            # 대화 히스토리 조회
            conversation_data = ChatService.get_conversation_report(conversation_id)
            if not conversation_data:
                raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}를 찾을 수 없습니다.")
            
            # 문제 데이터 조회
            p_id = conversation_data.get("p_id")
            if not p_id:
                raise HTTPException(status_code=400, detail="대화 세션에서 p_id를 찾을 수 없습니다.")
            
            problem_data = ProblemService.get_problem_by_id(p_id)
            if not problem_data:
                raise HTTPException(status_code=404, detail="문제 데이터를 찾을 수 없습니다.")
            
            # 대화 히스토리 구성
            chat_history = conversation_data.get("full_chat_log", [])
            if isinstance(chat_history, dict):
                chat_history = [chat_history]
            
            # 대화 컨텍스트 구성
            conversation_context = f"""
현재 대화 상태:
- conversation_id: {conversation_id}
- current_step: {current_step}
- attempts: {attempts}
- user_message: "{user_message}"

대화 히스토리:
"""
            
            for msg in chat_history[-5:]:  # 최근 5개 메시지만 포함
                role = msg.get("sender_role", "user")
                content = msg.get("message", "")
                if role == "user":
                    conversation_context += f"학생: {content}\n"
                else:
                    conversation_context += f"튜터: {content}\n"
            
            conversation_context += f"\n학생의 새로운 응답: {user_message}\n"
            conversation_context += "\n위의 프롬프트 규칙에 따라 다음 단계를 진행하거나 피드백을 제공하세요."
            
            # 프롬프트 생성
            prompt = PromptEngineeringService.create_step_by_step_prompt(problem_data)
            full_prompt = prompt + "\n\n" + conversation_context
        
        # AI 응답 생성
        ai_response = await get_gemini_response(full_prompt)
        
        # 응답에서 상태 정보 추출 (숨김 메타데이터)
        import re
        state_match = re.search(r'<STATE>(.*?)</STATE>', ai_response, re.DOTALL)
        current_step_response = current_step
        attempts_response = attempts
        
        if state_match:
            try:
                state_data = json.loads(state_match.group(1))
                current_step_response = state_data.get("current_step", current_step)
                attempts_response = state_data.get("attempts", attempts)
                # 상태 정보를 응답에서 제거
                ai_response = re.sub(r'<STATE>.*?</STATE>', '', ai_response, flags=re.DOTALL).strip()
            except json.JSONDecodeError:
                pass
        
        return {
            "conversation_id": conversation_id,
            "solution": ai_response,
            "current_step": current_step_response,
            "attempts": attempts_response,
            "problem_info": {
                "p_name": problem_data.get("p_name"),
                "main_chapt": problem_data.get("main_chapt"),
                "sub_chapt": problem_data.get("sub_chapt"),
                "p_level": problem_data.get("p_level"),
                "p_type": problem_data.get("p_type"),
                "con_type": problem_data.get("con_type")
            },
            "provider": PROVIDER,
            "model": GEMINI_MODEL,
            "token_usage": {
                "prompt_tokens": count_tokens(full_prompt),
                "response_tokens": count_tokens(ai_response),
                "total_tokens": count_tokens(full_prompt) + count_tokens(ai_response)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"대화형 단계별 풀이 생성 오류: {e}")
        raise HTTPException(status_code=500, detail=f"대화형 단계별 풀이 생성 실패: {e}")

@app.post("/ai/direct-solution")
async def get_direct_solution(request: dict):
    """직접 풀이를 위한 전용 엔드포인트"""
    return await get_problem_solution({**request, "solution_type": "direct"})

@app.get("/problems/search")
async def search_problem_by_page_and_number(page: int, number: str):
    """페이지 번호와 문제 번호로 문제를 검색합니다."""
    try:
        problem_data = ProblemService.get_problem_by_page_and_number(page, number)
        
        if not problem_data:
            raise HTTPException(status_code=404, detail=f"{page}페이지 {number}번 문제를 찾을 수 없습니다.")
        
        return problem_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"문제 검색 오류: {e}")
        raise HTTPException(status_code=500, detail=f"문제 검색 실패: {e}")

# 풀이, 유사문제, 교과서 개념
@app.get("/conversations/{conversation_id}/report")
async def get_conversation_report(conversation_id: str):
    """대화 세션의 상세 정보를 조회합니다."""
    try:
        conversation_data = ChatService.get_conversation_report(conversation_id)
        
        if not conversation_data:
            raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}를 찾을 수 없습니다.")
        
        # datetime 객체를 문자열로 변환
        if conversation_data.get('started_at'):
            conversation_data['started_at'] = conversation_data['started_at'].isoformat()
        if conversation_data.get('completed_at'):
            conversation_data['completed_at'] = conversation_data['completed_at'].isoformat()
        if conversation_data.get('message_time'):
            conversation_data['message_time'] = conversation_data['message_time'].isoformat()
        
        # full_chat_log가 리스트인 경우 그대로 유지, 딕셔너리인 경우 리스트로 변환
        if conversation_data.get('full_chat_log'):
            if isinstance(conversation_data['full_chat_log'], dict):
                # 딕셔너리인 경우 그대로 사용
                conversation_data['full_chat_log'] = ['full_chat_log']
            elif not isinstance(conversation_data['full_chat_log'], list):
                # 리스트도 딕셔너리도 아닌 경우 빈 리스트로 설정
                conversation_data['full_chat_log'] = []
        else:
            conversation_data['full_chat_log'] = []
        
        return jsonable_encoder(conversation_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"대화 세션 상세 정보 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=f"대화 세션 상세 정보 조회 실패: {e}")


# 리포트 데이터 조회 테스트 
@app.get("/test/basic-data/{conversation_id}")
async def test_basic_data(conversation_id: str):
    """기본 데이터 조회만 테스트합니다."""
    try:
        logger.info(f"=== 기본 데이터 테스트 시작 ===")
        logger.info(f"conversation_id: {conversation_id}")
        
        # 기본 데이터 조회
        basic_data = ChatService.get_basic_conversation_data(conversation_id)
        
        if not basic_data:
            logger.error(f"기본 데이터를 찾을 수 없음: {conversation_id}")
            raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}의 데이터를 찾을 수 없습니다.")
        
        logger.info(f"기본 데이터 조회 성공:")
        logger.info(f"  - conversation_info: {basic_data.get('conversation_info', {})}")
        logger.info(f"  - problem_info: {basic_data.get('problem_info', {})}")
        logger.info(f"  - chat_messages 개수: {len(basic_data.get('chat_messages', []))}")
        
        # 테스트 결과 반환
        test_result = {
            "conversation_id": conversation_id,
            "test_status": "success",
            "data_summary": {
                "conversation_info": basic_data['conversation_info'],
                "problem_info": {
                    "p_id": basic_data['problem_info'].get('p_id'),
                    "p_name": basic_data['problem_info'].get('p_name'),
                    "p_page": basic_data['problem_info'].get('p_page'),
                    "num_in_page": basic_data['problem_info'].get('num_in_page'),
                    "con_type": basic_data['problem_info'].get('con_type'),
                    "sub_chapt": basic_data['problem_info'].get('sub_chapt'),
                    "p_text": basic_data['problem_info'].get('p_text'),
                    "answer": basic_data['problem_info'].get('answer'),
                    "solution": basic_data['problem_info'].get('solution'),
                    "p_type": basic_data['problem_info'].get('p_type'),
                    "p_level": basic_data['problem_info'].get('p_level'),
                    "main_chapt": basic_data['problem_info'].get('main_chapt')
                },
                "chat_messages_count": len(basic_data['chat_messages']),
                "textbook_concepts_count": len(basic_data.get('textbook_concepts', []))
            },
            "chat_messages_sample": basic_data['chat_messages'][:3] if len(basic_data['chat_messages']) > 3 else basic_data['chat_messages'],
            "textbook_concepts_sample": basic_data.get('textbook_concepts', [])[:3] if basic_data.get('textbook_concepts') and len(basic_data.get('textbook_concepts', [])) > 3 else basic_data.get('textbook_concepts', [])
        }
        
        logger.info(f"=== 기본 데이터 테스트 완료 ===")
        
        return test_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"기본 데이터 테스트 오류: {e}")
        raise HTTPException(status_code=500, detail=f"기본 데이터 테스트 실패: {e}")
    
@app.get("/test/incorrect_problem_report_data/{conversation_id}")
async def incorrect_problem_report_data(conversation_id: str):
    """오답 리포트 생성을 위한 데이터 입력 부분만 테스트합니다."""
    try:
        logger.info(f"=== 데이터 입력 테스트 시작 ===")
        logger.info(f"conversation_id: {conversation_id}")
        
        # 1. 기본 데이터 조회
        logger.info("1. 기본 데이터 조회 시작...")
        basic_data = ChatService.get_basic_conversation_data(conversation_id)
        
        if not basic_data:
            logger.error(f"기본 데이터를 찾을 수 없음: {conversation_id}")
            raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}의 데이터를 찾을 수 없습니다.")
        
        logger.info(f"기본 데이터 조회 성공:")
        logger.info(f"  - conversation_info: {basic_data.get('conversation_info', {})}")
        logger.info(f"  - problem_info: {basic_data.get('problem_info', {})}")
        logger.info(f"  - problem_info: {basic_data.get('problem_info', {})}")
        logger.info(f"  - chat_messages 개수: {len(basic_data.get('chat_messages', []))}")
        
        # 2. 학생 답안 분석 프롬프트 생성 (실제 AI 호출 없이)
        logger.info("2. 학생 답안 분석 프롬프트 생성...")
        problem_data = basic_data['problem_info']
        chat_messages = basic_data['chat_messages']
        
        analysis_prompt = PromptEngineeringService.create_incorrect_problem_report_prompt(
            problem_data, chat_messages
        )
        
        logger.info(f"학생 답안 분석 프롬프트 생성 완료:")
        logger.info(f"  - 프롬프트 길이: {len(analysis_prompt)} 문자")
        logger.info(f"  - 프롬프트 미리보기 (처음 500자): {analysis_prompt[:500]}...")
        
        # 3. 오답 리포트 프롬프트 생성 (실제 AI 호출 없이)
        logger.info("3. 오답 리포트 프롬프트 생성...")
        
        # 교과서 개념 정보 활용
        textbook_concepts = basic_data.get('textbook_concepts', [])
        if textbook_concepts:
            # 첫 번째 개념을 기본으로 사용하고, 추가 개념들도 포함
            primary_concept = textbook_concepts[0]
            textbook_concept = {
                'tb_con': primary_concept.get('tb_con', problem_data.get('con_type', 'N/A')),
                'tb_sub_con': primary_concept.get('tb_sub_con', problem_data.get('sub_chapt', 'N/A')),
                'con_type': primary_concept.get('con_type', 'N/A'),
                'con_name': primary_concept.get('con_name', 'N/A'),
                'con_description': primary_concept.get('con_description', 'N/A'),
                'all_concepts': textbook_concepts  # 모든 관련 개념 정보 포함
            }
            logger.info(f"교과서 개념 정보 활용:")
            logger.info(f"  - 주요 개념: {primary_concept.get('con_type')} - {primary_concept.get('tb_con')} - {primary_concept.get('tb_sub_con')}")
            logger.info(f"  - 총 개념 수: {len(textbook_concepts)}")
        else:
            # 기존 방식으로 fallback
            textbook_concept = {
                'tb_con': problem_data.get('con_type', 'N/A'),
                'tb_sub_con': problem_data.get('sub_chapt', 'N/A'),
                'con_type': 'N/A',
                'con_name': 'N/A',
                'con_description': 'N/A',
                'all_concepts': []
            }
            logger.info("교과서 개념 정보 없음 - 기존 방식 사용")
        
        conversation_log = {
            'full_chat_log': chat_messages,
            'student_analysis': "테스트용 학생 답안 분석 결과 (실제 AI 응답 대신)"
        }
        
        report_prompt = PromptEngineeringService.create_incorrect_problem_report_prompt(
            problem_data, textbook_concept, conversation_log
        )
        
        logger.info(f"오답 리포트 프롬프트 생성 완료:")
        logger.info(f"  - 프롬프트 길이: {len(report_prompt)} 문자")
        logger.info(f"  - 프롬프트 미리보기 (처음 500자): {report_prompt[:500]}...")
        
        # 4. 토큰 사용량 계산
        analysis_tokens = count_tokens(analysis_prompt)
        report_tokens = count_tokens(report_prompt)
        
        logger.info(f"4. 토큰 사용량 계산 완료:")
        logger.info(f"  - 분석 프롬프트 토큰: {analysis_tokens}")
        logger.info(f"  - 리포트 프롬프트 토큰: {report_tokens}")
        logger.info(f"  - 총 프롬프트 토큰: {analysis_tokens + report_tokens}")
        
        # 5. 테스트 결과 반환
        test_result = {
            "conversation_id": conversation_id,
            "test_status": "success",
            "data_summary": {
                "conversation_info": basic_data['conversation_info'],
                "problem_info": {
                    "p_id": problem_data.get('p_id'),
                    "p_name": problem_data.get('p_name'),
                    "p_page": problem_data.get('p_page'),
                    "num_in_page": problem_data.get('num_in_page'),
                    "con_type": problem_data.get('con_type'),
                    "sub_chapt": problem_data.get('sub_chapt'),
                    "p_text": problem_data.get('p_text'),
                    "answer": problem_data.get('answer'),
                    "solution": problem_data.get('solution'),
                    "p_type": problem_data.get('p_type'),
                    "p_level": problem_data.get('p_level'),
                    "main_chapt": problem_data.get('main_chapt')
                },
                "chat_messages_count": len(chat_messages),
                "textbook_concepts_count": len(textbook_concepts) if textbook_concepts else 0
            },
            "prompt_info": {
                "analysis_prompt_length": len(analysis_prompt),
                "analysis_prompt_preview": analysis_prompt[:200] + "...",
                "analysis_prompt_full": analysis_prompt,
                "report_prompt_length": len(report_prompt),
                "report_prompt_preview": report_prompt[:200] + "...",
                "report_prompt_full": report_prompt,
                "analysis_tokens": analysis_tokens,
                "report_tokens": report_tokens,
                "total_tokens": analysis_tokens + report_tokens
            },
            "chat_messages_sample": chat_messages[:3] if len(chat_messages) > 3 else chat_messages,
            "textbook_concepts_sample": textbook_concepts[:3] if textbook_concepts and len(textbook_concepts) > 3 else textbook_concepts,
            "textbook_concept_used": textbook_concept
        }
        
        logger.info(f"=== 데이터 입력 테스트 완료 ===")
        
        return test_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"데이터 입력 테스트 오류: {e}")
        raise HTTPException(status_code=500, detail=f"데이터 입력 테스트 실패: {e}")
    
@app.get("/test/basic-data/{conversation_id}")
async def test_basic_data(conversation_id: str):
    """기본 데이터 조회만 테스트합니다."""
    try:
        logger.info(f"=== 기본 데이터 테스트 시작 ===")
        logger.info(f"conversation_id: {conversation_id}")
        
        # 기본 데이터 조회
        basic_data = ChatService.get_basic_conversation_data(conversation_id)
        
        if not basic_data:
            logger.error(f"기본 데이터를 찾을 수 없음: {conversation_id}")
            raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}의 데이터를 찾을 수 없습니다.")
        
        logger.info(f"기본 데이터 조회 성공:")
        logger.info(f"  - conversation_info: {basic_data.get('conversation_info', {})}")
        logger.info(f"  - problem_info: {basic_data.get('problem_info', {})}")
        logger.info(f"  - chat_messages 개수: {len(basic_data.get('chat_messages', []))}")
        
        # 테스트 결과 반환
        test_result = {
            "conversation_id": conversation_id,
            "test_status": "success",
            "data_summary": {
                "conversation_info": basic_data['conversation_info'],
                "problem_info": {
                    "p_id": basic_data['problem_info'].get('p_id'),
                    "p_name": basic_data['problem_info'].get('p_name'),
                    "p_page": basic_data['problem_info'].get('p_page'),
                    "num_in_page": basic_data['problem_info'].get('num_in_page'),
                    "con_type": basic_data['problem_info'].get('con_type'),
                    "sub_chapt": basic_data['problem_info'].get('sub_chapt'),
                    "p_text": basic_data['problem_info'].get('p_text'),
                    "answer": basic_data['problem_info'].get('answer'),
                    "solution": basic_data['problem_info'].get('solution'),
                    "p_type": basic_data['problem_info'].get('p_type'),
                    "p_level": basic_data['problem_info'].get('p_level'),
                    "main_chapt": basic_data['problem_info'].get('main_chapt')
                },
                "chat_messages_count": len(basic_data['chat_messages']),
                "textbook_concepts_count": len(basic_data.get('textbook_concepts', []))
            },
            "chat_messages_sample": basic_data['chat_messages'][:3] if len(basic_data['chat_messages']) > 3 else basic_data['chat_messages'],
            "textbook_concepts_sample": basic_data.get('textbook_concepts', [])[:3] if basic_data.get('textbook_concepts') and len(basic_data.get('textbook_concepts', [])) > 3 else basic_data.get('textbook_concepts', [])
        }
        
        logger.info(f"=== 기본 데이터 테스트 완료 ===")
        
        return test_result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"기본 데이터 테스트 오류: {e}")
        raise HTTPException(status_code=500, detail=f"기본 데이터 테스트 실패: {e}")

# 오답 리포트 생성 API
@app.post("/incorrect-answer-report/{conversation_id}")
async def generate_incorrect_answer_report(conversation_id: str):
    """오답 리포트를 생성합니다."""
    try:
        logger.info(f"=== 오답 리포트 생성 시작 ===")
        logger.info(f"conversation_id: {conversation_id}")
        
        # 1. 기본 데이터 조회
        logger.info("1. 기본 데이터 조회 시작...")
        basic_data = ChatService.get_basic_conversation_data(conversation_id)
        
        if not basic_data:
            logger.error(f"기본 데이터를 찾을 수 없음: {conversation_id}")
            raise HTTPException(status_code=404, detail=f"대화 세션 {conversation_id}의 데이터를 찾을 수 없습니다.")
        
        logger.info(f"기본 데이터 조회 성공:")
        logger.info(f"  - conversation_info: {basic_data.get('conversation_info', {})}")
        logger.info(f"  - problem_info: {basic_data.get('problem_info', {})}")
        logger.info(f"  - chat_messages 개수: {len(basic_data.get('chat_messages', []))}")
        
        # 2. 오답 리포트 프롬프트 생성 및 LLM 호출
        logger.info("2. 오답 리포트 프롬프트 생성 및 LLM 호출...")
        problem_data = basic_data['problem_info']
        chat_messages = basic_data['chat_messages']
        
        # 교과서 개념 정보 활용
        textbook_concepts = basic_data.get('textbook_concepts', [])
        if textbook_concepts:
            # 첫 번째 개념을 기본으로 사용하고, 추가 개념들도 포함
            primary_concept = textbook_concepts[0]
            textbook_concept = {
                'tb_con': primary_concept.get('tb_con', problem_data.get('con_type', 'N/A')),
                'tb_sub_con': primary_concept.get('tb_sub_con', problem_data.get('sub_chapt', 'N/A')),
                'con_type': primary_concept.get('con_type', 'N/A'),
                'con_name': primary_concept.get('con_name', 'N/A'),
                'con_description': primary_concept.get('con_description', 'N/A'),
                'all_concepts': textbook_concepts  # 모든 관련 개념 정보 포함
            }
            logger.info(f"교과서 개념 정보 활용:")
            logger.info(f"  - 주요 개념: {primary_concept.get('con_type')} - {primary_concept.get('tb_con')} - {primary_concept.get('tb_sub_con')}")
            logger.info(f"  - 총 개념 수: {len(textbook_concepts)}")
        else:
            # 기존 방식으로 fallback
            textbook_concept = {
                'tb_con': problem_data.get('con_type', 'N/A'),
                'tb_sub_con': problem_data.get('sub_chapt', 'N/A'),
                'con_type': 'N/A',
                'con_name': 'N/A',
                'con_description': 'N/A',
                'all_concepts': []
            }
            logger.info("교과서 개념 정보 없음 - 기존 방식 사용")
        
        conversation_log = {
            'full_chat_log': chat_messages,
            'student_analysis': "학생 답안 분석 결과 (직접 분석)"
        }
        
        report_prompt = PromptEngineeringService.create_incorrect_problem_report_prompt(
            problem_data, textbook_concept, conversation_log
        )
        
        logger.info(f"오답 리포트 프롬프트 생성 완료:")
        logger.info(f"  - 프롬프트 길이: {len(report_prompt)} 문자")
        
        # LLM 호출
        report_response = model.generate_content(report_prompt)
        report_content = report_response.text
        
        logger.info(f"오답 리포트 LLM 응답 완료:")
        logger.info(f"  - 응답 길이: {len(report_content)} 문자")
        
        # 3. 토큰 사용량 계산 및 로깅
        report_tokens = count_tokens(report_prompt)
        report_response_tokens = count_tokens(report_content)
        total_tokens = report_tokens + report_response_tokens
        
        # 토큰 사용량 로깅
        log_token_usage(report_tokens, report_response_tokens, total_tokens, GEMINI_MODEL, "incorrect_answer_report")
        
        logger.info(f"3. 토큰 사용량 계산 완료:")
        logger.info(f"  - 리포트 프롬프트 토큰: {report_tokens}")
        logger.info(f"  - 리포트 응답 토큰: {report_response_tokens}")
        logger.info(f"  - 총 토큰: {total_tokens}")
        
        # 4. 결과 반환
        result = {
            "conversation_id": conversation_id,
            "status": "success",
            "report": report_content,
            "metadata": {
                "conversation_info": basic_data['conversation_info'],
                "problem_info": {
                    "p_id": problem_data.get('p_id'),
                    "p_name": problem_data.get('p_name'),
                    "p_page": problem_data.get('p_page'),
                    "num_in_page": problem_data.get('num_in_page'),
                    "con_type": problem_data.get('con_type'),
                    "sub_chapt": problem_data.get('sub_chapt'),
                    "p_text": problem_data.get('p_text'),
                    "answer": problem_data.get('answer'),
                    "solution": problem_data.get('solution'),
                    "p_type": problem_data.get('p_type'),
                    "p_level": problem_data.get('p_level'),
                    "main_chapt": problem_data.get('main_chapt')
                },
                "chat_messages_count": len(chat_messages),
                "textbook_concepts_count": len(textbook_concepts) if textbook_concepts else 0,
                "token_usage": {
                    "report_prompt_tokens": report_tokens,
                    "report_response_tokens": report_response_tokens,
                    "total_tokens": total_tokens
                }
            }
        }
        
        logger.info(f"=== 오답 리포트 생성 완료 ===")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"오답 리포트 생성 오류: {e}")
        raise HTTPException(status_code=500, detail=f"오답 리포트 생성 실패: {e}")

# reports 테이블 저장 API
@app.post("/reports/save")
async def save_report(request: dict):
    """reports 테이블에 리포트 데이터를 저장합니다."""
    try:
        logger.info(f"=== reports 테이블 저장 시작 ===")
        logger.info(f"요청 데이터: {request}")
        
        # 필수 필드 검증
        required_fields = ['conversation_id', 'user_id', 'p_id', 'full_report_content']
        for field in required_fields:
            if field not in request:
                raise HTTPException(status_code=400, detail=f"필수 필드가 누락되었습니다: {field}")
        
        conn = db_manager.get_connection()
        with conn.cursor() as cursor:
            query = """
            INSERT INTO reports (
                conversation_id, user_id, p_id, created_at, generated_at, 
                status, prompt_tokens, response_tokens, total_tokens,
                report_type, language, learning_stats, full_report_content
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING report_id
            """
            
            now = datetime.now()
            cursor.execute(query, (
                request['conversation_id'],
                request['user_id'],
                request['p_id'],
                now,  # created_at
                now,  # generated_at
                request.get('status', 'completed'),
                request.get('prompt_tokens', 0),
                request.get('response_tokens', 0),
                request.get('total_tokens', 0),
                request.get('report_type', 'incorrect_answer'),
                request.get('language', 'ko'),
                json.dumps(request.get('learning_stats', {})),  # JSONB로 저장
                request['full_report_content']
            ))
            
            result = cursor.fetchone()
            report_id = result['report_id']
            conn.commit()
            
            logger.info(f"reports 테이블 저장 성공: report_id={report_id}")
            
            return {
                "status": "success",
                "report_id": report_id,
                "message": "리포트가 성공적으로 저장되었습니다."
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reports 테이블 저장 오류: {e}")
        raise HTTPException(status_code=500, detail=f"리포트 저장 실패: {e}")

# reports 테이블 조회 API
@app.get("/reports/{conversation_id}")
async def get_report_by_conversation(conversation_id: str):
    """conversation_id로 reports 테이블에서 리포트 데이터를 조회합니다."""
    try:
        logger.info(f"=== reports 테이블 조회 시작 ===")
        logger.info(f"conversation_id: {conversation_id}")
        
        conn = db_manager.get_connection()
        with conn.cursor() as cursor:
            query = """
            SELECT * FROM reports 
            WHERE conversation_id = %s 
            ORDER BY created_at DESC 
            LIMIT 1
            """
            
            logger.info(f"쿼리 실행: {query}")
            logger.info(f"파라미터: {conversation_id}")
            
            cursor.execute(query, (conversation_id,))
            result = cursor.fetchone()
            
            logger.info(f"쿼리 결과: {result}")
            
            if result:
                # datetime 객체를 문자열로 변환
                if result.get('created_at'):
                    result['created_at'] = result['created_at'].isoformat()
                if result.get('generated_at'):
                    result['generated_at'] = result['generated_at'].isoformat()
                
                logger.info(f"reports 테이블 조회 성공: report_id={result['report_id']}")
                return result
            else:
                logger.info(f"conversation_id {conversation_id}에 해당하는 리포트가 없습니다")
                raise HTTPException(status_code=404, detail=f"conversation_id {conversation_id}에 해당하는 리포트를 찾을 수 없습니다")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reports 테이블 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=f"리포트 조회 실패: {e}")

# 유사문제 추천 API
@app.get("/similar-problems/{p_id}")
async def get_similar_problem(p_id: int):
    """p_id에 해당하는 문제의 유사문제를 추천합니다."""
    try:
        logger.info(f"=== 유사문제 추천 시작 ===")
        logger.info(f"p_id: {p_id}")
        
        conn = db_manager.get_connection()
        with conn.cursor() as cursor:
            # problem_sim_map 테이블을 통해 유사문제 조회
            query = """
            SELECT 
                s.sim_p_id,
                s.p_name,
                s.p_page,
                s.num_in_page,
                s.p_img_url,
                s.main_chapt,
                s.sub_chapt,
                s.con_type,
                s.p_type,
                s.p_level,
                s.p_text,
                s.answer,
                s.solution
            FROM problem_sim_map m
            JOIN sim_problems s ON s.sim_p_id = m.sim_p_id
            WHERE m.p_id = %s
            LIMIT 1
            """
            
            logger.info(f"쿼리 실행: {query}")
            logger.info(f"파라미터: {p_id}")
            
            cursor.execute(query, (p_id,))
            result = cursor.fetchone()
            
            logger.info(f"쿼리 결과: {result}")
            
            if result:
                # datetime 객체를 문자열로 변환
                if result.get('created_date'):
                    result['created_date'] = result['created_date'].isoformat()
                if result.get('data'):
                    result['data'] = result['data'].isoformat()
                
                logger.info(f"유사문제 추천 성공: sim_p_id={result['sim_p_id']}")
                return result
            else:
                logger.info(f"p_id {p_id}에 해당하는 유사문제가 없습니다")
                raise HTTPException(status_code=404, detail=f"p_id {p_id}에 해당하는 유사문제를 찾을 수 없습니다")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"유사문제 추천 오류: {e}")
        raise HTTPException(status_code=500, detail=f"유사문제 추천 실패: {e}")
