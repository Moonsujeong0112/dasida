package com.example.auth.exception;

public class EmailAlreadyExistsException extends AuthException {
    public EmailAlreadyExistsException(String email) {
        super("이미 존재하는 이메일입니다: " + email, "EMAIL_ALREADY_EXISTS", 409);
    }
}
