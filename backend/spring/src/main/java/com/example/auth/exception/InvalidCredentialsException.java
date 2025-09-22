package com.example.auth.exception;

public class InvalidCredentialsException extends AuthException {
    public InvalidCredentialsException() {
        super("이메일 또는 비밀번호가 올바르지 않습니다", "INVALID_CREDENTIALS", 401);
    }
}
