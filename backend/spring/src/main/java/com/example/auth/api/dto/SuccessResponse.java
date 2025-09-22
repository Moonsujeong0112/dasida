package com.example.auth.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SuccessResponse<T>(
    String message,
    T data,
    Instant timestamp
) {
    public static <T> SuccessResponse<T> of(String message, T data) {
        return new SuccessResponse<>(message, data, Instant.now());
    }
    
    public static <T> SuccessResponse<T> of(String message) {
        // data가 null이 되지 않도록 기본값 제공
        return new SuccessResponse<>(message, (T) "SUCCESS", Instant.now());
    }
}
