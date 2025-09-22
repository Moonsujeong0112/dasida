package com.example.auth.util;

import com.example.auth.exception.WeakPasswordException;

public class PasswordValidator {
    
    public static void validate(String password) {
        if (password == null || password.trim().isEmpty()) {
            throw new WeakPasswordException("비밀번호를 입력해주세요");
        }
        
        if (password.length() < 6) {
            throw new WeakPasswordException("비밀번호는 최소 6자 이상이어야 합니다");
        }
        
        if (password.length() > 128) {
            throw new WeakPasswordException("비밀번호는 128자 이하여야 합니다");
        }
        
        // if (!password.matches(".*[A-Z].*")) {
        //     throw new WeakPasswordException("비밀번호는 대문자를 포함해야 합니다");
        // }
        
        if (!password.matches(".*[a-z].*")) {
            throw new WeakPasswordException("비밀번호는 소문자를 포함해야 합니다");
        }
        
        if (!password.matches(".*[0-9].*")) {
            throw new WeakPasswordException("비밀번호는 숫자를 포함해야 합니다");
        }
        
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?].*")) {
            throw new WeakPasswordException("비밀번호는 특수문자를 포함해야 합니다");
        }
        
        // 연속된 문자나 숫자 검사 - 임시로 비활성화
        // if (hasConsecutiveChars(password, 4)) {
        //     throw new WeakPasswordException("4자 이상 연속된 문자나 숫자를 사용할 수 없습니다");
        // }
        
        // 반복된 문자 검사
        // if (hasRepeatedChars(password)) {
        //     throw new WeakPasswordException("동일한 문자가 3번 이상 반복될 수 없습니다");
        // }
    }
    
    private static boolean hasConsecutiveChars(String password, int minLength) {
        for (int i = 0; i <= password.length() - minLength; i++) {
            boolean isConsecutive = true;
            char[] chars = new char[minLength];
            
            // minLength만큼의 문자 추출
            for (int j = 0; j < minLength; j++) {
                chars[j] = password.charAt(i + j);
            }
            
            // 모두 문자이거나 모두 숫자인지 확인
            boolean allLetters = true;
            boolean allDigits = true;
            for (char c : chars) {
                if (!Character.isLetter(c)) allLetters = false;
                if (!Character.isDigit(c)) allDigits = false;
            }
            
            if (!allLetters && !allDigits) continue;
            
            // 연속성 검사
            for (int j = 1; j < minLength; j++) {
                if (chars[j] != chars[j-1] + 1) {
                    isConsecutive = false;
                    break;
                }
            }
            
            if (isConsecutive) {
                return true;
            }
        }
        return false;
    }
    
    private static boolean hasRepeatedChars(String password) {
        for (int i = 0; i < password.length() - 2; i++) {
            char c = password.charAt(i);
            if (c == password.charAt(i + 1) && c == password.charAt(i + 2)) {
                return true;
            }
        }
        return false;
    }
}
