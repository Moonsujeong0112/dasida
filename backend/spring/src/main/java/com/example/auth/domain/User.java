package com.example.auth.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "users", uniqueConstraints = @UniqueConstraint(columnNames = "email"))
public class User {
  @Id 
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "user_id")
  private Long id;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(nullable = false)
  private String passwordHash;      // 비밀번호는 “해시”로 저장!

  private String name;

  @Column(nullable = false)
  private Instant createdAt = Instant.now();

  // getters/setters
  public Long getId(){ return id; }
  public String getEmail(){ return email; }
  public void setEmail(String email){ this.email = email; }
  public String getPasswordHash(){ return passwordHash; }
  public void setPasswordHash(String ph){ this.passwordHash = ph; }
  public String getName(){ return name; }
  public void setName(String n){ this.name = n; }
  public Instant getCreatedAt(){ return createdAt; }
  public void setCreatedAt(Instant t){ this.createdAt = t; }
}

