package com.example.auth.api;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
public class FileController {

    @GetMapping("/uploads/textbooks/{filename}")
    public ResponseEntity<Resource> getTextbookFile(@PathVariable String filename) {
        try {
            Resource resource = new ClassPathResource("static/uploads/textbooks/" + filename);
            
            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/uploads/problem_img/{filename}")
    public ResponseEntity<Resource> getProblemImage(@PathVariable String filename) {
        try {
            Resource resource = new ClassPathResource("static/uploads/problem_img/" + filename);
            
            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            // 확장자에 따른 Content-Type 설정
            String contentType = getContentType(filename);

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                    .contentType(MediaType.parseMediaType(contentType))
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    private String getContentType(String filename) {
        String extension = getFileExtension(filename).toLowerCase();
        return switch (extension) {
            case "png" -> MediaType.IMAGE_PNG_VALUE;
            case "jpg", "jpeg" -> MediaType.IMAGE_JPEG_VALUE;
            default -> "application/octet-stream";
        };
    }

    private String getFileExtension(String filename) {
        int dotIndex = filename.lastIndexOf('.');
        return (dotIndex != -1) ? filename.substring(dotIndex + 1) : "";
    }
}

// @RestController
// public class FileController {
//     @GetMapping("/uploads/{filename}")
//     public ResponseEntity<Resource> getFile(@PathVariable String filename) {
//         try {
//             // 확장자 확인 (pdf, png 등)
//             String fileExtension = getFileExtension(filename).toLowerCase();

//             // 파일 경로 설정: PDF는 textbooks 폴더, 이미지는 problem_img 폴더에서 찾음
//             String baseDir = switch (fileExtension) {
//                 case "pdf" -> "static/uploads/textbooks/";
//                 case "png", "jpg", "jpeg" -> "static/uploads/problem_img/";
//                 default -> null;
//             };

//             if (baseDir == null) {
//                 return ResponseEntity.badRequest().build();  // 지원하지 않는 확장자
//             }

//             Resource resource = new ClassPathResource(baseDir + filename);
//             if (!resource.exists()) {
//                 return ResponseEntity.notFound().build();
//             }

//             // Content-Type 지정
//             String contentType = switch (fileExtension) {
//                 case "pdf" -> MediaType.APPLICATION_PDF_VALUE;
//                 case "png" -> MediaType.IMAGE_PNG_VALUE;
//                 case "jpg", "jpeg" -> MediaType.IMAGE_JPEG_VALUE;
//                 default -> "application/octet-stream";
//             };

//             return ResponseEntity.ok()
//                     .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
//                     .contentType(MediaType.parseMediaType(contentType))
//                     .body(resource);

//         } catch (Exception e) {
//             return ResponseEntity.internalServerError().build();
//         }
//     }

//     private String getFileExtension(String filename) {
//         int dotIndex = filename.lastIndexOf('.');
//         return (dotIndex != -1) ? filename.substring(dotIndex + 1) : "";
//     }
// }
