package com.example.auth.exception;

public class WeakPasswordException extends AuthException {
    public WeakPasswordException(String reason) {
        super("비밀번호가 너무 약합니다: " + reason, "WEAK_PASSWORD", 400);
    }
}
