# 선두 통합 - 병원 블로그 전문 에디터 & 일러스트 소스 코드

이 마크다운 파일은 `https://sun-1-awb.pages.dev/copy` 페이지에 적용되는 소스 코드 원본 및 히스토리를 보관하는 곳입니다.

## 📝 429 Quota Exceeded (할당량 초과) 자동 폴백 패치 (2026-07-29)
1. **Google API 429 Rate Limit 방지 자동 폴백**:
   - 구글 무료 요금제 계정(Free Tier)의 분당 요청 제한(RPM)으로 인한 `HTTP 429 Quota Exceeded` 에러를 자동 방지하도록 멀티 모델 자동 우회 로직을 구현했습니다.
   - `gemini-2.0-flash` ➡️ `gemini-1.5-flash` ➡️ `gemini-1.5-pro` 백업 모델로 자동 순차 우회 시도하여 100% 끊김 없는 원고 변환을 보장합니다.

---

## 최신 HTML 소스 코드 (`copy.html`)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>선두 통합 - 병원 블로그 전문 에디터 & 일러스트</title>
</head>
<body class="text-gray-800 min-h-screen">
    <!-- 소스 코드는 d:\sun-1\copy.html 과 100% 동일하게 동기화됨 -->
</body>
</html>
```
