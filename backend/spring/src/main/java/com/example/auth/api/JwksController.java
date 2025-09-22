package com.example.auth.api;

import com.example.auth.crypto.PemKeyLoader;
import com.nimbusds.jose.jwk.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.security.interfaces.RSAPublicKey;
import java.util.Map;

@RestController
public class JwksController {
  @Value("${auth.keys.kid}") String kid;
  @Value("${auth.keys.public-pem}") Resource pubPem;

  @GetMapping("/.well-known/jwks.json")
  public Map<String, Object> jwks() throws Exception {
    RSAPublicKey pub = (RSAPublicKey) PemKeyLoader.loadPublic(pubPem);
    RSAKey jwk = new RSAKey.Builder(pub).keyID(kid).build();
    return new JWKSet(jwk).toJSONObject();
  }
}

