import psycopg2
from psycopg2.extras import RealDictCursor
from typing import List, Dict, Optional, Any
import logging
import os

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PostgreSQL 설정
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5434")
DB_NAME = os.getenv("DB_NAME", "test")
DB_USER = os.getenv("DB_USER", "moon")
DB_PASSWORD = os.getenv("DB_PASSWORD", "moon1")

class DatabaseManager:
    """PostgreSQL 데이터베이스 연결 및 관리 클래스"""
    
    def __init__(self):
        self.connection = None
    
    def get_connection(self):
        """데이터베이스 연결을 반환합니다."""
        if self.connection is None or self.connection.closed:
            try:
                self.connection = psycopg2.connect(
                    host=DB_HOST,
                    port=DB_PORT,
                    database=DB_NAME,
                    user=DB_USER,
                    password=DB_PASSWORD,
                    cursor_factory=RealDictCursor
                )
                logger.info("PostgreSQL 데이터베이스에 연결되었습니다.")
            except Exception as e:
                logger.error(f"데이터베이스 연결 오류: {e}")
                raise Exception(f"데이터베이스 연결 실패: {e}")
        return self.connection
    
    def close_connection(self):
        """데이터베이스 연결을 닫습니다."""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("PostgreSQL 데이터베이스 연결이 닫혔습니다.")

# 전역 데이터베이스 매니저 인스턴스
db_manager = DatabaseManager()
