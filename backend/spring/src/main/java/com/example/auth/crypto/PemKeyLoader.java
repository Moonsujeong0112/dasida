package com.example.auth.crypto;

import org.springframework.core.io.Resource;
import org.springframework.util.FileCopyUtils;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.Base64;

public class PemKeyLoader {
  private static String read(Resource r) throws Exception {
    return new String(FileCopyUtils.copyToByteArray(r.getInputStream()), StandardCharsets.UTF_8);
  }
  public static PrivateKey loadPrivate(Resource pem) throws Exception {
    String s = read(pem).replaceAll("-----BEGIN (.*)-----|-----END (.*)-----|\\s",""); 
    return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(s)));
  }
  public static PublicKey loadPublic(Resource pem) throws Exception {
    String s = read(pem).replaceAll("-----BEGIN (.*)-----|-----END (.*)-----|\\s",""); 
    return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(s)));
  }
}

