package com.example.auth.api;

import com.example.auth.api.dto.*;
import com.example.auth.domain.User;
import com.example.auth.repo.UserRepo;
import com.example.auth.service.TokenService;
import com.example.auth.exception.EmailAlreadyExistsException;
import com.example.auth.exception.InvalidCredentialsException;
import com.example.auth.util.PasswordValidator;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController 
@RequestMapping("/api/auth")
public class AuthController {
  private final UserRepo users;
  private final PasswordEncoder encoder;
  private final TokenService tokens;

  public AuthController(UserRepo users, PasswordEncoder encoder, TokenService tokens) {
    this.users = users; this.encoder = encoder; this.tokens = tokens;
  }

  @PostMapping("/register")
  public ResponseEntity<SuccessResponse<String>> register(@Valid @RequestBody RegisterReq req) {
    // 이메일 중복 검사
    users.findByEmailIgnoreCase(req.email())
         .ifPresent(u -> { throw new EmailAlreadyExistsException(req.email()); });
    
    // 비밀번호 보안 검증
    PasswordValidator.validate(req.password());
    
    // 사용자 생성 및 저장
    User u = new User();
    u.setEmail(req.email().toLowerCase());
    u.setPasswordHash(encoder.encode(req.password()));
    u.setName(req.name());
    users.save(u);
    
    return ResponseEntity.ok(SuccessResponse.of("회원가입이 완료되었습니다", "SUCCESS"));
  }

  @PostMapping("/login")
  public ResponseEntity<SuccessResponse<TokenRes>> login(@Valid @RequestBody LoginReq req) throws Exception {
    User u = users.findByEmailIgnoreCase(req.email().toLowerCase())
        .filter(x -> x.getPasswordHash()!=null && encoder.matches(req.password(), x.getPasswordHash()))
        .orElseThrow(() -> new InvalidCredentialsException());
    
    var pair = tokens.issue(u.getId());
    TokenRes tokenRes = new TokenRes(pair.get("access"), pair.get("refresh"), u.getName(), u.getEmail());
    
    return ResponseEntity.ok(SuccessResponse.of("로그인이 완료되었습니다", tokenRes));
  }

  @PostMapping("/refresh")
  public ResponseEntity<SuccessResponse<TokenRes>> refresh(@Valid @RequestBody RefreshReq req) throws Exception {
    try {
      // 리프레시 토큰으로 사용자 ID 추출
      Long userId = tokens.validateRefreshToken(req.refresh());
      
      // 새로운 토큰 쌍 발급
      var pair = tokens.issue(userId);
      
      // 사용자 정보 조회
      User user = users.findById(userId)
          .orElseThrow(() -> new InvalidCredentialsException());
      
      TokenRes tokenRes = new TokenRes(pair.get("access"), pair.get("refresh"), user.getName(), user.getEmail());
      
      return ResponseEntity.ok(SuccessResponse.of("토큰이 갱신되었습니다", tokenRes));
    } catch (Exception e) {
      throw new InvalidCredentialsException();
    }
  }

  @PostMapping("/logout")
  public ResponseEntity<SuccessResponse<String>> logout(@Valid @RequestBody RefreshReq req) {
    try {
      // 리프레시 토큰 무효화 (블랙리스트에 추가)
      tokens.invalidateRefreshToken(req.refresh());
      
      return ResponseEntity.ok(SuccessResponse.of("로그아웃이 완료되었습니다", "SUCCESS"));
    } catch (Exception e) {
      // 로그아웃은 실패해도 성공으로 처리 (클라이언트에서 토큰 삭제)
      return ResponseEntity.ok(SuccessResponse.of("로그아웃이 완료되었습니다", "SUCCESS"));
    }
  }
}

