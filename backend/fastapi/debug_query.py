#!/usr/bin/env python3
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import os
from dotenv import load_dotenv

load_dotenv()

# PostgreSQL 설정
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "app")
DB_USER = os.getenv("DB_USER", "app")
DB_PASSWORD = os.getenv("DB_PASSWORD", "app")

def check_full_chat_log():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            cursor_factory=RealDictCursor
        )
        
        with conn.cursor() as cursor:
            query = """
            SELECT conversation_id, full_chat_log, pg_typeof(full_chat_log) as data_type
            FROM conversations 
            WHERE conversation_id = '80818a76-4990-4144-8026-6234b6834d9d'
            """
            cursor.execute(query)
            result = cursor.fetchone()
            
            if result:
                print("=== 데이터베이스 조회 결과 ===")
                print(f"conversation_id: {result['conversation_id']}")
                print(f"data_type: {result['data_type']}")
                print(f"full_chat_log: {result['full_chat_log']}")
                print(f"full_chat_log type: {type(result['full_chat_log'])}")
                
                if result['full_chat_log']:
                    print(f"full_chat_log length: {len(result['full_chat_log'])}")
                    print(f"full_chat_log first item: {result['full_chat_log'][0] if len(result['full_chat_log']) > 0 else 'None'}")
            else:
                print("해당 conversation_id를 찾을 수 없습니다.")
                
    except Exception as e:
        print(f"오류: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    check_full_chat_log()
