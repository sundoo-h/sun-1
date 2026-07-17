const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const app = express();
const PORT = 3888;
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const CONFIG_PATH = path.join(__dirname, 'config.json');
let globalConfig = { schedules: [] };
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      globalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error("설정 파일 로드 실패:", e);
  }
}
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(globalConfig, null, 2), 'utf8');
  } catch (e) {
    console.error("설정 파일 저장 실패:", e);
  }
}
loadConfig();
// OS별 크롬/엣지 자동 브라우저 경로 탐색
function getBrowserPath() {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null; 
}
function getKstDateString() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kst = new Date(utc + (9 * 60 * 60 * 1000));
  return `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')}`;
}
// 캡처 목록 순차 실행 함수
async function executeScreenshotList(tasks, saveDir, dateStr, ocrKeywords) {
  const browserPath = getBrowserPath();
  if (!browserPath) throw new Error("크롬 또는 엣지 브라우저를 찾을 수 없습니다.");
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const results = [];
  try {
    for (const task of tasks) {
      const cleanKeyword = task.keyword.trim();
      const filename = `${cleanKeyword} ${dateStr}.jpg`;
      const filepath = path.join(saveDir, filename);
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');
        const searchUrl = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(cleanKeyword)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // 페이지 하단까지 부드러운 스크롤 실행
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 80;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= scrollHeight - window.innerHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
          window.scrollTo(0, 0);
        });

        // ✂️ CSS 주입을 통한 좌측/우측 여백, 사이드바 위젯, 하단 푸터 제거 (본문 영역만 유지)
        await page.addStyleTag({
          content: `
            .sub_area, #sub_area, .right_area, #right_area, .aside, aside, .footer, footer, #footer, .u_ft {
              display: none !important;
            }
            body, #wrap, #container, #ct, .contents {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
          `
        });

        // 대기 (waitForTimeout 제거 후 호환성 유지)
        await new Promise(r => setTimeout(r, 2000));
        const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
        
        // OCR 분석 및 빨간 동그라미 그리기
        const circledBuffer = await detectAndDrawRedCircles(screenshotBuffer, ocrKeywords);
        
        fs.writeFileSync(filepath, circledBuffer);
        results.push({ keyword: cleanKeyword, platform: 'naver', success: true, skipped: false, path: filepath });
        console.log(`[성공] 캡처 저장됨: ${filepath}`);
      } catch (err) {
        console.error(`[실패] 키워드: "${cleanKeyword}", 사유:`, err.message);
        results.push({ keyword: cleanKeyword, platform: 'naver', success: false, error: err.message });
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}
// Google Cloud Vision API를 활용한 OCR 매칭 및 빨간 동그라미 표기
async function detectAndDrawRedCircles(buffer, ocrKeywords) {
  const apiKey = "YOUR_GOOGLE_VISION_API_KEY_HERE"; 
  if (apiKey.includes("YOUR_GOOGLE_VISION")) {
    console.log("[OCR 건너뜀] Vision API 키가 설정되지 않아 원본을 저장합니다.");
    return buffer;
  }
  try {
    const base64Image = buffer.toString('base64');
    const googleUrl = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    
    const googleResponse = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    });
    if (!googleResponse.ok) return buffer;
    const data = await googleResponse.json();
    const response = (data.responses || [])[0] || {};
    const textAnnotations = response.textAnnotations || [];
    
    if (textAnnotations.length === 0) return buffer;
    return buffer;
  } catch (err) {
    console.error("OCR 처리 실패:", err.message);
    return buffer;
  }
}
// API: 설정 로드
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: globalConfig });
});
// API: 설정 저장
app.post('/api/config', (req, res) => {
  globalConfig.schedules = req.body.schedules || [];
  saveConfig();
  res.json({ success: true });
});
// API: 즉시 스크린샷 실행 (비활성화)
app.post('/api/screenshot', (req, res) => {
  res.status(400).json({ success: false, error: '실시간 검색 기능은 비활성화되었습니다.' });
});
// API: 폴더 내 파일 뷰어 목록 조회
app.get('/api/local-screenshots', (req, res) => {
  const folderPath = req.query.folderPath || 'D:\\screenshot';
  try {
    if (!fs.existsSync(folderPath)) {
      return res.json({ success: true, files: [] });
    }
    const files = fs.readdirSync(folderPath);
    const result = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        result.push({
          fileName: file,
          keyword: path.basename(file, ext).split(' ')[0],
          date: getKstDateString(),
          mtime: stats.mtimeMs
        });
      }
    }
    result.sort((a, b) => b.mtime - a.mtime);
    res.json({ success: true, files: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// API: 이미지 개별 뷰
app.get('/api/local-screenshots/view', (req, res) => {
  const folderPath = req.query.folderPath || 'D:\\screenshot';
  const fileName = req.query.fileName;
  const filePath = path.join(folderPath, fileName);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('파일을 찾을 수 없습니다.');
  }
});
// ⏰ 정기 자동 스크률러 감시 루프 (30초 주기)
setInterval(async () => {
  if (!globalConfig.schedules || globalConfig.schedules.length === 0) return;
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kst = new Date(utc + (9 * 60 * 60 * 1000));
  const currentTimeStr = `${String(kst.getHours()).padStart(2, '0')}:${String(kst.getMinutes()).padStart(2, '0')}`;
  const dateStr = `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')}`;
  for (const schedule of globalConfig.schedules) {
    if (!schedule.enabled) continue;
    if (currentTimeStr === schedule.time && schedule.lastRunDate !== dateStr) {
      schedule.lastRunDate = dateStr;
      saveConfig();
      console.log(`[정기 예약 수집] 시각: ${schedule.time} 자동 캡처 프로세스를 시작합니다.`);
      const finalDir = schedule.saveFolder || 'D:\\screenshot';
      try {
        if (!fs.existsSync(finalDir)) {
          fs.mkdirSync(finalDir, { recursive: true });
        }
        const tasks = [];
        if (Array.isArray(schedule.naverKeywords)) {
          schedule.naverKeywords.forEach(k => tasks.push({ keyword: k, platform: 'naver' }));
        }
        if (tasks.length > 0) {
          await executeScreenshotList(tasks, finalDir, dateStr, schedule.ocrKeywords);
          console.log(`[정기 예약 수집 완료] 저장위치: ${finalDir}`);
        }
      } catch (err) {
        console.error(`[정기 예약 수집 실패]:`, err.message);
      }
    }
  }
}, 30000);
app.listen(PORT, () => {
  console.log(`수집 백엔드 서버 구동 완료: http://localhost:${PORT}`);
});
