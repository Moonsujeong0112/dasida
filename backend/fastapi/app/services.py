from typing import List, Dict, Optional, Any
from .database import db_manager, logger
import uuid
from datetime import datetime

class ChatService:
    """채팅 메시지 및 대화 세션 관리 서비스 클래스"""
    
    @staticmethod
    def create_conversation(user_id: int, p_id: int) -> str:
        """새로운 대화 세션을 생성합니다."""
        try:
            conversation_id = str(uuid.uuid4())
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                INSERT INTO conversations (conversation_id, user_id, p_id, started_at, data)
                VALUES (%s, %s, %s, %s, %s)
                """
                now = datetime.now()
                cursor.execute(query, (conversation_id, user_id, p_id, now, now))
                conn.commit()
                logger.info(f"새로운 대화 세션 생성: {conversation_id}")
                return conversation_id
        except Exception as e:
            logger.error(f"대화 세션 생성 오류: {e}")
            raise Exception(f"대화 세션 생성 실패: {e}")
    
    @staticmethod
    def save_chat_message(conversation_id: str, user_id: int, p_id: int, 
                         sender_role: str, message: str, message_type: str = "text") -> int:
        """채팅 메시지를 저장하고 full_chat_log를 업데이트합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                # 1. 채팅 메시지 저장 (chat_id는 데이터베이스가 자동 할당)
                query = """
                INSERT INTO chat_messages (conversation_id, user_id, p_id, sender_role, message, message_type, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING chat_id
                """
                now = datetime.now()
                cursor.execute(query, (conversation_id, user_id, p_id, sender_role, message, message_type, now))
                result = cursor.fetchone()
                chat_id = result['chat_id'] if result else None
                
                if not chat_id:
                    logger.error(f"chat_id를 가져올 수 없음: {result}")
                    raise Exception("chat_id를 가져올 수 없습니다")
                
                # 2. full_chat_log 업데이트
                update_query = """
                UPDATE conversations 
                SET full_chat_log = (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'chat_id', cm.chat_id,
                            'sender_role', cm.sender_role,
                            'message', cm.message,
                            'message_type', cm.message_type,
                            'created_at', cm.created_at
                        ) ORDER BY cm.created_at
                    )
                    FROM chat_messages cm
                    WHERE cm.conversation_id = %s
                ),
                data = %s
                WHERE conversation_id = %s
                """
                cursor.execute(update_query, (conversation_id, now, conversation_id))
                
                conn.commit()
                logger.info(f"채팅 메시지 저장 및 full_chat_log 업데이트: chat_id={chat_id}, role={sender_role}")
                return chat_id
        except Exception as e:
            logger.error(f"채팅 메시지 저장 오류: {e}")
            raise Exception(f"채팅 메시지 저장 실패: {e}")
    
    @staticmethod
    def get_conversation_messages(conversation_id: str) -> List[Dict[str, Any]]:
        """대화 세션의 모든 메시지를 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT chat_id, conversation_id, user_id, p_id, sender_role, 
                       message, message_type, created_at
                FROM chat_messages 
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                """
                cursor.execute(query, (conversation_id,))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"대화 메시지 조회 오류: {e}")
            return []
    
    @staticmethod
    def get_user_conversations(user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        """사용자의 대화 세션 목록을 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT c.conversation_id, c.user_id, c.p_id, c.started_at, c.completed_at,
                       p.p_name, p.p_page, p.num_in_page, p.p_type, p.p_level,
                       p.main_chapt, p.sub_chapt, p.con_type,
                       COUNT(cm.chat_id) as message_count
                FROM conversations c
                LEFT JOIN problems p ON c.p_id = p.p_id
                LEFT JOIN chat_messages cm ON c.conversation_id = cm.conversation_id
                WHERE c.user_id = %s
                GROUP BY c.conversation_id, c.user_id, c.p_id, c.started_at, c.completed_at,
                         p.p_name, p.p_page, p.num_in_page, p.p_type, p.p_level,
                         p.main_chapt, p.sub_chapt, p.con_type
                ORDER BY c.started_at DESC
                LIMIT %s
                """
                cursor.execute(query, (user_id, limit))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"사용자 대화 세션 조회 오류: {e}")
            return []
    
    @staticmethod
    def complete_conversation(conversation_id: str) -> bool:
        """대화 세션을 완료 상태로 변경합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                UPDATE conversations 
                SET completed_at = %s
                WHERE conversation_id = %s
                """
                now = datetime.now()
                cursor.execute(query, (now, conversation_id))
                conn.commit()
                logger.info(f"대화 세션 완료: {conversation_id}")
                return True
        except Exception as e:
            logger.error(f"대화 세션 완료 처리 오류: {e}")
            return False
    
    @staticmethod
    def update_conversation_chat_log(conversation_id: str, full_chat_log: Dict[str, Any]) -> bool:
        """대화 세션의 전체 채팅 로그를 업데이트합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                UPDATE conversations 
                SET full_chat_log = %s, data = %s
                WHERE conversation_id = %s
                """
                now = datetime.now()
                cursor.execute(query, (full_chat_log, now, conversation_id))
                conn.commit()
                logger.info(f"대화 세션 채팅 로그 업데이트: {conversation_id}")
                return True
        except Exception as e:
            logger.error(f"대화 세션 채팅 로그 업데이트 오류: {e}")
            return False
    
    @staticmethod
    def get_conversation_report(conversation_id: str) -> Optional[Dict[str, Any]]:
        """대화 세션의 상세 정보를 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT
                  u.user_id,
                  u.name AS user_name,
                  u.email,
                  c.conversation_id,
                  c.p_id,
                  c.started_at,
                  c.completed_at,
                  p.p_code,
                  p.p_text,
                  p.p_level,
                  p.num_in_page,
                  p.p_name,
                  p.p_page,
                  p.p_img_url,
                  p.main_chapt,
                  p.sub_chapt,
                  p.p_type,
                  c.full_chat_log,
                  c.data AS message_time
                FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                JOIN problems p ON c.p_id = p.p_id
                WHERE c.conversation_id = %s
                ORDER BY c.started_at DESC
                """
                cursor.execute(query, (conversation_id,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            logger.error(f"대화 세션 상세 정보 조회 오류: {e}")
            return None

    @staticmethod
    def get_basic_conversation_data(conversation_id: str) -> Optional[Dict[str, Any]]:
        """오답 리포트 생성을 위한 기본 데이터를 조회합니다 (학생 답안 분석 제외)."""
        try:
            logger.info(f"=== get_basic_conversation_data 시작 ===")
            logger.info(f"conversation_id: {conversation_id}")
            
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                # 1. 대화 세션 기본 정보 조회
                logger.info("1. 대화 세션 기본 정보 조회...")
                query = """
                SELECT
                  c.conversation_id,
                  c.user_id,
                  c.p_id,
                  c.started_at,
                  c.completed_at,
                  c.full_chat_log,
                  u.name AS user_name,
                  u.email,
                  p.p_id,
                  p.p_name,
                  p.p_page,
                  p.num_in_page,
                  p.main_chapt,
                  p.sub_chapt,
                  p.con_type,
                  p.p_type,
                  p.p_level,
                  p.p_text,
                  p.answer,
                  p.solution
                FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                JOIN problems p ON c.p_id = p.p_id
                WHERE c.conversation_id = %s
                """
                cursor.execute(query, (conversation_id,))
                result = cursor.fetchone()
                
                if not result:
                    logger.error(f"대화 세션을 찾을 수 없음: {conversation_id}")
                    return None
                
                conversation_data = dict(result)
                logger.info(f"대화 세션 조회 성공:")
                logger.info(f"  - user_id: {conversation_data.get('user_id')}")
                logger.info(f"  - p_id: {conversation_data.get('p_id')}")
                logger.info(f"  - user_name: {conversation_data.get('user_name')}")
                logger.info(f"  - p_name: {conversation_data.get('p_name')}")
                logger.info(f"  - p_page: {conversation_data.get('p_page')}")
                logger.info(f"  - num_in_page: {conversation_data.get('num_in_page')}")
                
                # 2. 교과서 개념 정보 조회 (n:n 매핑 테이블 활용)
                logger.info("2. 교과서 개념 정보 조회...")
                textbook_concepts_query = """
                SELECT
                  tc.con_id,
                  tc.con_type,
                  tc.tb_con,
                  tc.tb_sub_con
                FROM problem_concept_map pcm
                JOIN textbook_concept tc ON pcm.con_id = tc.con_id
                WHERE pcm.p_id = %s
                ORDER BY tc.con_type, tc.tb_con, tc.tb_sub_con
                """
                cursor.execute(textbook_concepts_query, (conversation_data['p_id'],))
                textbook_concepts = [dict(row) for row in cursor.fetchall()]
                
                logger.info(f"교과서 개념 정보 조회 성공:")
                logger.info(f"  - 개념 개수: {len(textbook_concepts)}")
                for i, concept in enumerate(textbook_concepts[:3]):  # 처음 3개만 로그
                    logger.info(f"  - 개념 {i+1}: {concept.get('con_type')} - {concept.get('tb_con')} - {concept.get('tb_sub_con')}")
                
                # 3. 채팅 메시지 조회
                logger.info("3. 채팅 메시지 조회...")
                chat_messages_query = """
                SELECT
                  cm.chat_id,
                  cm.sender_role,
                  cm.message,
                  cm.message_type,
                  cm.created_at,
                  EXTRACT(EPOCH FROM (cm.created_at - c.started_at)) as time_from_start
                FROM chat_messages cm
                JOIN conversations c ON cm.conversation_id = c.conversation_id
                WHERE cm.conversation_id = %s
                ORDER BY cm.created_at ASC
                """
                cursor.execute(chat_messages_query, (conversation_id,))
                chat_messages = [dict(row) for row in cursor.fetchall()]
                
                logger.info(f"채팅 메시지 조회 성공:")
                logger.info(f"  - 메시지 개수: {len(chat_messages)}")
                for i, msg in enumerate(chat_messages[:3]):  # 처음 3개만 로그
                    logger.info(f"  - 메시지 {i+1}: {msg.get('sender_role')} - {msg.get('message', '')[:50]}...")
                
                # 4. 결과 데이터 구성
                logger.info("4. 결과 데이터 구성...")
                basic_data = {
                    'conversation_info': {
                        'conversation_id': conversation_data['conversation_id'],
                        'user_id': conversation_data['user_id'],
                        'user_name': conversation_data['user_name'],
                        'started_at': conversation_data['started_at'].isoformat(),
                        'completed_at': conversation_data['completed_at'].isoformat() if conversation_data['completed_at'] else None
                    },
                    'problem_info': {
                        'p_id': conversation_data['p_id'],
                        'p_name': conversation_data['p_name'],
                        'p_page': conversation_data['p_page'],
                        'num_in_page': conversation_data['num_in_page'],
                        'main_chapt': conversation_data['main_chapt'],
                        'sub_chapt': conversation_data['sub_chapt'],
                        'con_type': conversation_data['con_type'],
                        'p_type': conversation_data['p_type'],
                        'p_level': conversation_data['p_level'],
                        'p_text': conversation_data['p_text'],
                        'answer': conversation_data['answer'],
                        'solution': conversation_data['solution']
                    },
                    'textbook_concepts': textbook_concepts,
                    'chat_messages': chat_messages
                }
                
                logger.info(f"=== get_basic_conversation_data 완료 ===")
                return basic_data
                
        except Exception as e:
            logger.error(f"기본 데이터 조회 오류: {e}")
            return None
        """오답 리포트 생성을 위한 상세 데이터를 조회합니다."""
        try:
            logger.info(f"=== get_incorrect_answer_data 시작 ===")
            logger.info(f"conversation_id: {conversation_id}")
            
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                # 1. 대화 세션 기본 정보 조회
                logger.info("1. 대화 세션 기본 정보 조회...")
                query = """
                SELECT
                  c.conversation_id,
                  c.user_id,
                  c.p_id,
                  c.started_at,
                  c.completed_at,
                  c.full_chat_log,
                  u.name AS user_name,
                  u.email,
                  p.p_id,
                  p.p_name,
                  p.p_page,
                  p.num_in_page,
                  p.main_chapt,
                  p.sub_chapt,
                  p.con_type,
                  p.p_type,
                  p.p_level,
                  p.p_text,
                  p.answer,
                  p.solution
                FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                JOIN problems p ON c.p_id = p.p_id
                WHERE c.conversation_id = %s
                """
                cursor.execute(query, (conversation_id,))
                result = cursor.fetchone()
                
                if not result:
                    logger.error(f"대화 세션을 찾을 수 없음: {conversation_id}")
                    return None
                
                conversation_data = dict(result)
                logger.info(f"대화 세션 조회 성공:")
                logger.info(f"  - user_id: {conversation_data.get('user_id')}")
                logger.info(f"  - p_id: {conversation_data.get('p_id')}")
                logger.info(f"  - user_name: {conversation_data.get('user_name')}")
                logger.info(f"  - p_name: {conversation_data.get('p_name')}")
                logger.info(f"  - p_page: {conversation_data.get('p_page')}")
                logger.info(f"  - num_in_page: {conversation_data.get('num_in_page')}")
                
                # 2. 채팅 메시지 상세 분석
                logger.info("2. 채팅 메시지 상세 분석...")
                chat_messages_query = """
                SELECT
                  cm.chat_id,
                  cm.sender_role,
                  cm.message,
                  cm.message_type,
                  cm.created_at,
                  EXTRACT(EPOCH FROM (cm.created_at - c.started_at)) as time_from_start
                FROM chat_messages cm
                JOIN conversations c ON cm.conversation_id = c.conversation_id
                WHERE cm.conversation_id = %s
                ORDER BY cm.created_at ASC
                """
                cursor.execute(chat_messages_query, (conversation_id,))
                chat_messages = [dict(row) for row in cursor.fetchall()]
                
                logger.info(f"채팅 메시지 조회 성공:")
                logger.info(f"  - 메시지 개수: {len(chat_messages)}")
                for i, msg in enumerate(chat_messages[:3]):  # 처음 3개만 로그
                    logger.info(f"  - 메시지 {i+1}: {msg.get('sender_role')} - {msg.get('message', '')[:50]}...")
                
                # 3. 오답 패턴 분석
                logger.info("3. 오답 패턴 분석...")
                student_answers = []
                current_step = 1
                attempts = {}
                
                for msg in chat_messages:
                    if msg['sender_role'] == 'user':
                        # 사용자 답안 분석
                        answer_data = {
                            'student_answer': msg['message'],
                            'timestamp': msg['created_at'].isoformat(),
                            'time_from_start': int(msg['time_from_start']),
                            'message_type': msg['message_type'],
                            'step': current_step,
                            'attempts': attempts.get(current_step, 0) + 1
                        }
                        
                        # 정답 여부 판단 (간단한 로직 - 실제로는 AI 응답에서 추출)
                        # 여기서는 full_chat_log에서 정답 여부를 추출하는 로직 필요
                        answer_data['is_correct'] = False  # 기본값, 실제로는 분석 필요
                        answer_data['hints_used'] = False  # 힌트 사용 여부
                        
                        student_answers.append(answer_data)
                        
                        # 시도 횟수 증가
                        attempts[current_step] = attempts.get(current_step, 0) + 1
                
                logger.info(f"학생 답안 분석 완료:")
                logger.info(f"  - 답안 개수: {len(student_answers)}")
                logger.info(f"  - attempts: {attempts}")
                
                # 4. 통계 계산
                logger.info("4. 통계 계산...")
                total_attempts = len(student_answers)
                correct_answers = sum(1 for answer in student_answers if answer.get('is_correct', False))
                accuracy_rate = (correct_answers / total_attempts * 100) if total_attempts > 0 else 0
                
                # 5. 시간 분석
                total_time = 0
                if chat_messages:
                    total_time = max(msg['time_from_start'] for msg in chat_messages)
                
                logger.info(f"통계 계산 완료:")
                logger.info(f"  - total_attempts: {total_attempts}")
                logger.info(f"  - correct_answers: {correct_answers}")
                logger.info(f"  - accuracy_rate: {accuracy_rate}%")
                logger.info(f"  - total_time: {total_time}초")
                
                # 6. 결과 데이터 구성
                logger.info("5. 결과 데이터 구성...")
                report_data = {
                    'conversation_info': {
                        'conversation_id': conversation_data['conversation_id'],
                        'user_id': conversation_data['user_id'],
                        'user_name': conversation_data['user_name'],
                        'started_at': conversation_data['started_at'].isoformat(),
                        'completed_at': conversation_data['completed_at'].isoformat() if conversation_data['completed_at'] else None
                    },
                    'problem_info': {
                        'p_id': conversation_data['p_id'],
                        'p_name': conversation_data['p_name'],
                        'p_page': conversation_data['p_page'],
                        'num_in_page': conversation_data['num_in_page'],
                        'main_chapt': conversation_data['main_chapt'],
                        'sub_chapt': conversation_data['sub_chapt'],
                        'con_type': conversation_data['con_type'],
                        'p_type': conversation_data['p_type'],
                        'p_level': conversation_data['p_level'],
                        'p_text': conversation_data['p_text'],
                        'answer': conversation_data['answer'],
                        'solution': conversation_data['solution']
                    },
                    'learning_analysis': {
                        'total_attempts': total_attempts,
                        'correct_answers': correct_answers,
                        'accuracy_rate': round(accuracy_rate, 2),
                        'total_time_seconds': int(total_time),
                        'average_time_per_attempt': int(total_time / total_attempts) if total_attempts > 0 else 0,
                        'steps_completed': current_step,
                        'attempts_per_step': attempts
                    },
                    'student_answers': student_answers,
                    'chat_messages': chat_messages
                }
                
                logger.info(f"=== get_incorrect_answer_data 완료 ===")
                return report_data
                
        except Exception as e:
            logger.error(f"오답 데이터 조회 오류: {e}")
            return None

class ProblemService:
    """문제 데이터 관련 서비스 클래스"""
    
    @staticmethod
    def get_problem_by_id(p_id: int) -> Optional[Dict[str, Any]]:
        """문제 ID로 문제 정보를 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT p_id, book_id, p_code, p_name, p_page, num_in_page, 
                       p_img_url, main_chapt, sub_chapt, con_type, con_id,
                       p_type, p_level, p_text, answer, solution, sol_img_url,
                       sub_cat, created_date, data
                FROM problems 
                WHERE p_id = %s
                """
                cursor.execute(query, (p_id,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            logger.error(f"문제 조회 오류: {e}")
            return None

    @staticmethod
    def get_problem_by_page_and_number(p_page: int, num_in_page: str) -> Optional[Dict[str, Any]]:
        """페이지와 문제번호로 문제 정보를 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT p.p_id, p.book_id, p.p_code, p.p_name, p.p_page, p.num_in_page,
                    p.p_img_url, p.main_chapt, p.sub_chapt, p.con_type, p.con_id,
                    p.p_type, p.p_level, p.p_text, p.answer, p.solution, p.sol_img_url,
                    p.sub_cat, p.created_date, p.data,
                    tc.tb_con, tc.tb_sub_con
                FROM problems p
                LEFT JOIN problem_concept_map pcm ON p.p_id = pcm.p_id
                LEFT JOIN textbook_concept tc ON pcm.con_id = tc.con_id
                WHERE p.p_page = %s AND p.num_in_page = %s
                LIMIT 1
                """
                cursor.execute(query, (p_page, num_in_page))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            logger.error(f"문제 조회 오류: {e}")
            return None
    
    @staticmethod
    def get_problems_by_chapter(main_chapt: str, sub_chapt: Optional[str] = None) -> List[Dict[str, Any]]:
        """단원별 문제 목록을 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                if sub_chapt:
                    query = """
                    SELECT p_id, p_code, p_name, p_page, num_in_page, 
                           p_type, p_level, p_text, answer, solution
                    FROM problems 
                    WHERE main_chapt = %s AND sub_chapt = %s
                    ORDER BY p_page, num_in_page
                    """
                    cursor.execute(query, (main_chapt, sub_chapt))
                else:
                    query = """
                    SELECT p_id, p_code, p_name, p_page, num_in_page, 
                           p_type, p_level, p_text, answer, solution
                    FROM problems 
                    WHERE main_chapt = %s
                    ORDER BY p_page, num_in_page
                    """
                    cursor.execute(query, (main_chapt,))
                
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"단원별 문제 조회 오류: {e}")
            return []
    
    @staticmethod
    def get_problems_by_difficulty(p_level: str, limit: int = 10) -> List[Dict[str, Any]]:
        """난이도별 문제 목록을 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT p_id, p_code, p_name, p_page, num_in_page, 
                       main_chapt, sub_chapt, p_type, p_level, p_text, answer, solution
                FROM problems 
                WHERE p_level = %s
                ORDER BY RANDOM()
                LIMIT %s
                """
                cursor.execute(query, (p_level, limit))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"난이도별 문제 조회 오류: {e}")
            return []

class ReportService:
    """리포트 관련 서비스 클래스"""
    
    @staticmethod
    def extract_error_patterns_from_report(report_content: str) -> List[str]:
        """리포트 내용에서 오답 패턴을 추출합니다."""
        if not report_content:
            logger.info("리포트 내용이 비어있음")
            return []
        
        # 오답 패턴 매핑
        pattern_mapping = {
            '문제 이해 부족': '문항 해석 실수',
            '개념 이해 부족': '개념 오해',
            '풀이 방법 잘못 선택': '전략 선택 오류',
            '계산 실수': '계산 실수',
            '단위 실수': '표현 실수',
            '성급한 판단': '절차 수행 오류'
        }
        
        # 리포트에서 "**오답 패턴**: " 부분 찾기
        import re
        pattern_match = re.search(r'\*\*오답 패턴\*\*:\s*(.+)', report_content)
        
        if pattern_match:
            patterns_text = pattern_match.group(1).strip()
            logger.info(f"패턴 텍스트 추출: '{patterns_text}'")
            
            # 쉼표로 구분된 패턴들을 분리
            patterns = [p.strip() for p in patterns_text.split(',')]
            logger.info(f"분리된 패턴들: {patterns}")
            
            # 매핑된 UI 이름으로 변환
            ui_patterns = []
            for pattern in patterns:
                if pattern in pattern_mapping:
                    ui_patterns.append(pattern_mapping[pattern])
                    logger.info(f"패턴 매핑: '{pattern}' -> '{pattern_mapping[pattern]}'")
                else:
                    # 매핑되지 않은 패턴은 그대로 사용
                    ui_patterns.append(pattern)
                    logger.info(f"매핑되지 않은 패턴: '{pattern}' (그대로 사용)")
            
            logger.info(f"최종 UI 패턴들: {ui_patterns}")
            return ui_patterns
        else:
            logger.info("'**오답 패턴**:' 패턴을 찾을 수 없음")
            logger.info(f"리포트 내용 미리보기: {report_content[:300]}...")
        
        return []

    @staticmethod
    def get_user_conversations_with_error_patterns(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """사용자의 대화 목록을 오답 패턴과 함께 조회합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT c.conversation_id, c.user_id, c.p_id, c.started_at, c.completed_at,
                       p.p_name, p.p_page, p.num_in_page, p.p_type, p.p_level,
                       p.main_chapt, p.sub_chapt, p.con_type,
                       r.full_report_content,
                       COUNT(cm.chat_id) as message_count
                FROM conversations c
                LEFT JOIN problems p ON c.p_id = p.p_id
                LEFT JOIN reports r ON c.conversation_id = r.conversation_id
                LEFT JOIN chat_messages cm ON c.conversation_id = cm.conversation_id
                WHERE c.user_id = %s
                GROUP BY c.conversation_id, c.user_id, c.p_id, c.started_at, c.completed_at,
                         p.p_name, p.p_page, p.num_in_page, p.p_type, p.p_level,
                         p.main_chapt, p.sub_chapt, p.con_type, r.full_report_content
                ORDER BY c.started_at DESC
                LIMIT %s
                """
                cursor.execute(query, (user_id, limit))
                results = cursor.fetchall()
                
                conversations = []
                for row in results:
                    conversation = dict(row)
                    
                    # 리포트에서 오답 패턴 추출
                    if conversation.get('full_report_content'):
                        logger.info(f"리포트 데이터 발견: conversation_id={conversation['conversation_id']}")
                        logger.info(f"리포트 내용 미리보기: {conversation['full_report_content'][:200]}...")
                        
                        error_patterns = ReportService.extract_error_patterns_from_report(
                            conversation['full_report_content']
                        )
                        conversation['error_patterns'] = error_patterns
                        
                        logger.info(f"추출된 오답 패턴: {error_patterns}")
                    else:
                        logger.info(f"리포트 데이터 없음: conversation_id={conversation['conversation_id']}")
                        conversation['error_patterns'] = []
                    
                    conversations.append(conversation)
                
                return conversations
                
        except Exception as e:
            logger.error(f"사용자 대화 목록 조회 오류: {e}")
            return []
    
    @staticmethod
    def search_problems(keyword: str, limit: int = 10) -> List[Dict[str, Any]]:
        """키워드로 문제를 검색합니다."""
        try:
            conn = db_manager.get_connection()
            with conn.cursor() as cursor:
                query = """
                SELECT p_id, p_code, p_name, p_page, num_in_page, 
                       main_chapt, sub_chapt, p_type, p_level, p_text, answer, solution
                FROM problems 
                WHERE p_text ILIKE %s OR p_name ILIKE %s OR main_chapt ILIKE %s OR sub_chapt ILIKE %s
                ORDER BY p_page, num_in_page
                LIMIT %s
                """
                search_term = f"%{keyword}%"
                cursor.execute(query, (search_term, search_term, search_term, search_term, limit))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"문제 검색 오류: {e}")
            return []
