# 선두 통합 - 병원 블로그 전문 에디터 & 일러스트 소스 코드

이 마크다운 파일은 `https://sun-1-awb.pages.dev/copy` 페이지에 적용되는 소스 코드 원본 및 네이버 포스팅 매크로 봇 연동 히스토리를 보관하는 곳입니다.

## 📝 변경 히스토리 (2026-07-29)
1. **네이버 스마트에디터 ONE 포스팅 매크로(RPA) 기능 연동**:
   - 2번칸 변환 원고 상단 우측에 `📝 네이버 임시저장 전송` 버튼 추가.
   - 클릭 시 로컬 API `/api/naver-post`를 통해 `naver_post_bot.js` 봇 기동.
2. **블로그 서식 시뮬레이션 매크로 구현**:
   - 블로그 샘플(`224361192618`) 양식 적용:
     - 1열 5행 목차 표(Table) 자동 생성 및 분홍색 배경(`#ef8aaa`) 지정, 볼드/남색 텍스트 세팅.
     - 본문 나눔스퀘어 폰트 및 가운데 정렬.
     - 소제목 크기 19px, 볼드, 글자 색상 남색(`#2b2a73`) 자동 서식화.
     - 작성 완료 후 스마트에디터 오른쪽 상단의 **[저장]** 버튼을 자동 클릭하여 [임시저장] 상태로 완료.

---

## 최신 HTML 소스 코드 (`copy.html`)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>선두 통합 - 병원 블로그 전문 에디터 & 일러스트</title>
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- JSZip & FileSaver -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    
    <!-- Fonts & Icons -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    
    <style>
        body { 
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Inter', sans-serif; 
            background-color: #f3f4f6; 
        }
        
        /* 텍스트 에디터 스타일 */
        .editor-box { min-height: 400px; max-height: 600px; overflow-y: auto; }
        .highlight-red { background-color: #fee2e2; color: #dc2626; font-weight: bold; padding: 0 4px; border-radius: 4px; }
        .show-duplicates .duplicate-word { 
            background-color: rgba(253, 224, 71, 0.4); 
            border-bottom: 2px solid #facc15; 
            border-radius: 2px;
            padding: 0 1px;
            transition: all 0.2s;
        }
        #box2:empty:before { content: attr(placeholder); color: #9ca3af; pointer-events: none; display: block; }
        
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

        /* 일러스트 로더 스타일 */
        .loader {
            border: 4px solid #f3f3f3; border-top: 4px solid #3b82f6;
            border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body class="text-gray-800 min-h-screen">
    <!-- 소스 코드는 d:\sun-1\copy.html 과 100% 동일하게 동기화됨 -->
</body>
</html>
```
