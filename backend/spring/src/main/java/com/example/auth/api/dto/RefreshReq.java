package com.example.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

public record RefreshReq(@NotBlank String refresh) {}

