package com.example.auth.api.dto;

import jakarta.validation.constraints.*;

public record LoginReq(
  @Email(message = "올바른 이메일 형식이 아닙니다")
  @NotBlank(message = "이메일을 입력해주세요")
  String email,
  
  @NotBlank(message = "비밀번호를 입력해주세요")
  String password,
  
  @Size(max = 100, message = "디바이스 ID는 100자 이하여야 합니다")
  String deviceId
) {}

