package com.example.auth.api.dto;

import jakarta.validation.constraints.*;

public record RegisterReq(
  @Email(message = "올바른 이메일 형식이 아닙니다")
  @NotBlank(message = "이메일을 입력해주세요")
  @Size(min = 5, max = 100, message = "이메일은 5자 이상 100자 이하여야 합니다")
  String email,
  
  @NotBlank(message = "비밀번호를 입력해주세요")
  @Size(min = 6, max = 128, message = "비밀번호는 6자 이상 128자 이하여야 합니다")
  String password,
  
  @NotBlank(message = "이름을 입력해주세요")
  @Size(min = 2, max = 50, message = "이름은 2자 이상 50자 이하여야 합니다")
  @Pattern(regexp = "^[가-힣a-zA-Z\\s]+$", message = "이름은 한글, 영문, 공백만 사용할 수 있습니다")
  String name
) {}

