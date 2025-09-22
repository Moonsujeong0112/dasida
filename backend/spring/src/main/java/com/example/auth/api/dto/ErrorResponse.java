package com.example.auth.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
    String errorCode,
    String message,
    int status,
    String details,
    Instant timestamp,
    String path
) {
    public ErrorResponse(String errorCode, String message, int status, String path) {
        this(errorCode, message, status, null, Instant.now(), path);
    }
    
    public ErrorResponse(String errorCode, String message, int status, String details, String path) {
        this(errorCode, message, status, details, Instant.now(), path);
    }
}
