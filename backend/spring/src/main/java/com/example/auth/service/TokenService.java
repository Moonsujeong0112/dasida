package com.example.auth.service;

import com.example.auth.crypto.PemKeyLoader;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.security.PrivateKey;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

@Service
public class TokenService {
  @Value("${auth.issuer}") String issuer;
  @Value("${auth.access-minutes}") int accessMinutes;
  @Value("${auth.refresh-days}") int refreshDays;
  @Value("${auth.keys.kid}") String kid;
  @Value("${auth.keys.private-pem}") Resource privPem;

  // 무효화된 토큰들을 저장하는 블랙리스트 (실제 운영에서는 Redis 사용 권장)
  private final Set<String> blacklistedTokens = ConcurrentHashMap.newKeySet();

  private String sign(Map<String,Object> claims, Instant exp) throws Exception {
    PrivateKey priv = PemKeyLoader.loadPrivate(privPem);
    JWSHeader h = new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(JOSEObjectType.JWT).build();
    JWTClaimsSet.Builder b = new JWTClaimsSet.Builder().issuer(issuer).issueTime(new Date()).expirationTime(Date.from(exp));
    claims.forEach(b::claim);
    SignedJWT jwt = new SignedJWT(h, b.build());
    jwt.sign(new RSASSASigner(priv));
    return jwt.serialize();
  }

  public Map<String,String> issue(Long userId) throws Exception {
    Instant now = Instant.now();
    String access  = sign(Map.of("sub", String.valueOf(userId), "scope","USER"), now.plusSeconds(60L*accessMinutes));
    String jti = UUID.randomUUID().toString();
    String refresh = sign(Map.of("sub", String.valueOf(userId), "jti", jti), now.plusSeconds(24L*60*60*refreshDays));
    return Map.of("access", access, "refresh", refresh);
  }

  /**
   * 리프레시 토큰을 검증하고 사용자 ID를 반환
   */
  public Long validateRefreshToken(String refreshToken) throws Exception {
    if (blacklistedTokens.contains(refreshToken)) {
      throw new RuntimeException("토큰이 무효화되었습니다");
    }

    SignedJWT jwt = SignedJWT.parse(refreshToken);
    
    // 토큰 만료 확인
    if (jwt.getJWTClaimsSet().getExpirationTime().before(new Date())) {
      throw new RuntimeException("토큰이 만료되었습니다");
    }

    // 발급자 확인
    if (!issuer.equals(jwt.getJWTClaimsSet().getIssuer())) {
      throw new RuntimeException("잘못된 토큰 발급자입니다");
    }

    // 사용자 ID 추출
    String userIdStr = jwt.getJWTClaimsSet().getSubject();
    if (userIdStr == null) {
      throw new RuntimeException("토큰에 사용자 정보가 없습니다");
    }

    return Long.parseLong(userIdStr);
  }

  /**
   * 리프레시 토큰을 무효화 (블랙리스트에 추가)
   */
  public void invalidateRefreshToken(String refreshToken) {
    blacklistedTokens.add(refreshToken);
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  public boolean isTokenBlacklisted(String token) {
    return blacklistedTokens.contains(token);
  }
}

