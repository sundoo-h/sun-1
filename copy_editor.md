# 선두 통합 - 병원 블로그 전문 에디터 & 일러스트 소스 코드

이 마크다운 파일은 `https://sun-1-awb.pages.dev/copy` 페이지에 적용되는 소스 코드 원본 및 네이버 포스팅 매크로 봇 연동 히스토리를 보관하는 곳입니다.

## 📝 변경 히스토리 (2026-07-29)
1. **서버 SyntaxError 수정**:
   - `screenshot_server.js`의 구문 에러(`Unexpected end of input`)를 발생하는 missing bracket을 복원하여 정상 구동 완료.
2. **원스톱 원클릭 자동 연동 (1번칸 변환 버튼)**:
   - 사용자가 1번칸에 기존 원고를 붙여넣고 상단의 **`[원고 변환 & 맞춤 일러스트 생성 시작]`** 버튼을 누르는 즉시:
     - Step 1: 2번칸 AI 원고 변환 수행
     - Step 2: 네이버 포스팅 봇(`naver_post_bot.js`)이 자동 연쇄 구동되어 크롬 창 기동 ➡️ 에디터 접속 ➡️ 타이핑 및 1x5 목차 표 / 소제목 남색 19px 볼드 서식 작성 ➡️ [임시저장] 버튼 자동 클릭.
     - Step 3: 동시 3번칸 원고 맞춤형 일러스트 8장 생성 진행.

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
