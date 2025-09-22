package com.example.auth.api;

import com.example.auth.api.dto.SuccessResponse;
import com.example.auth.domain.User;
import com.example.auth.repo.UserRepo;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class UserController {
  private final UserRepo users;
  
  public UserController(UserRepo users) {
    this.users = users;
  }
  
  @GetMapping("/api/me")
  public ResponseEntity<SuccessResponse<Map<String, Object>>> me(@AuthenticationPrincipal Jwt jwt) {
    Long userId = Long.parseLong(jwt.getSubject());
    User user = users.findById(userId).orElse(null);
    
    if (user != null) {
      Map<String, Object> userInfo = Map.of(
        "userId", userId,
        "name", user.getName(),
        "email", user.getEmail(),
        "scope", jwt.getClaimAsString("scope")
      );
      return ResponseEntity.ok(SuccessResponse.of("사용자 정보 조회 성공", userInfo));
    } else {
      Map<String, Object> fallback = Map.of(
        "userId", userId,
        "name", "사용자" + userId,
        "email", "user" + userId + "@example.com",
        "scope", jwt.getClaimAsString("scope")
      );
      return ResponseEntity.ok(SuccessResponse.of("사용자 정보 조회 성공", fallback));
    }
  }
}

