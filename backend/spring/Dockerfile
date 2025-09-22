# --- build stage ---
FROM gradle:8.8-jdk17 AS build
WORKDIR /src
COPY . .
RUN gradle clean bootJar --no-daemon

# --- run stage ---
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /src/build/libs/*.jar /app/app.jar
COPY --from=build /src/src/main/resources/static /app/static
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
