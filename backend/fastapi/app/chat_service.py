from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class ChatMessageRequest(BaseModel):
    conversation_id: Optional[str] = None
    user_id: int
    p_id: int
    sender_role: str = "user"  # user | dasida | system
    message: str
    message_type: str = "text"

class ConversationRequest(BaseModel):
    user_id: int
    p_id: int

class ChatResponse(BaseModel):
    message: str
    conversation_id: str
    chat_id: int
    provider: str
    model: str

class ChatMessage(BaseModel):
    chat_id: int
    conversation_id: str
    user_id: int
    p_id: int
    sender_role: str
    message: str
    message_type: str
    created_at: datetime

class Conversation(BaseModel):
    conversation_id: str
    user_id: int
    p_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    full_chat_log: Optional[Dict[str, Any]] = None
    data: datetime

# 풀이, 유사문제 리포트 응답 모델 정의 
class ConversationReport(BaseModel):
    user_id: int
    user_name: str
    email: str
    conversation_id: str
    p_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    p_code: str
    p_text: str
    p_level: str
    full_chat_log: Optional[List[Dict[str, Any]]] = None
    message_time: datetime
