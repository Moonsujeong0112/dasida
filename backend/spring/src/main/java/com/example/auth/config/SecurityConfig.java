package com.example.auth.config;

import com.example.auth.crypto.PemKeyLoader;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;

import java.security.interfaces.RSAPublicKey;

@Configuration
public class SecurityConfig {

  @Value("${auth.keys.public-pem}") Resource pubPem;

  @Bean PasswordEncoder passwordEncoder(){ return new BCryptPasswordEncoder(); }

  @Bean JwtDecoder jwtDecoder() throws Exception {
    RSAPublicKey pub = (RSAPublicKey) PemKeyLoader.loadPublic(pubPem);
    return NimbusJwtDecoder.withPublicKey(pub).build();
  }

  @Bean
  SecurityFilterChain filter(HttpSecurity http) throws Exception {
    http
      .csrf(csrf -> csrf.disable())
      .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .httpBasic(h -> h.disable())
      .formLogin(f -> f.disable())
      .authorizeHttpRequests(auth -> auth
        .requestMatchers("/health", "/.well-known/**", "/api/auth/**", "/error", "/uploads/**").permitAll() // PDF 파일 접근 허용
        .anyRequest().authenticated()
      )
      .oauth2ResourceServer(oauth -> oauth.jwt());
    return http.build();
  }
}
