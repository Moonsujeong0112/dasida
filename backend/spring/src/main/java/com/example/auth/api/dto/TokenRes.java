package com.example.auth.api.dto;

public record TokenRes(String access, String refresh, String name, String email) {}

