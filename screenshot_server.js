const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { exec, spawn } = require('child_process');

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
        await page.setViewport({ width: 1080, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(cleanKeyword)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // 페이지 하단까지 부드러운 스크롤 실행
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= scrollHeight - window.innerHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 80);
          });
          window.scrollTo(0, 0);
        });

        // 푸터(footer) 영역만 화면에서 완벽하게 숨김 처리
        await page.addStyleTag({
          content: `
            #footer, footer, .u_ft, .footer_wrap {
              display: none !important;
            }
          `
        });

        // 대기
        await new Promise(r => setTimeout(r, 2000));

        // 🎯 100% 무료 로컬 돔 조작형 OCR (구글 Vision API 가 필요 없는 무설정 빨간 원 표시 기능)
        if (Array.isArray(ocrKeywords) && ocrKeywords.length > 0) {
          await page.evaluate((keywords) => {
            const cleanKeywords = keywords.map(k => k.trim()).filter(k => k.length > 0);
            if (cleanKeywords.length === 0) return;

            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );

            const nodesToReplace = [];
            let node;
            while (node = walker.nextNode()) {
              const text = node.nodeValue;
              const parent = node.parentNode;
              if (!parent) continue;
              const parentTagName = parent.tagName.toUpperCase();
              if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parentTagName)) continue;

              for (const word of cleanKeywords) {
                if (text.includes(word)) {
                  nodesToReplace.push({ node, word });
                  break; 
                }
              }
            }

            nodesToReplace.forEach(({ node, word }) => {
              const parent = node.parentNode;
              if (!parent) return;

              const text = node.nodeValue;
              const parts = text.split(word);
              const fragment = document.createDocumentFragment();

              parts.forEach((part, index) => {
                if (part) {
                  fragment.appendChild(document.createTextNode(part));
                }
                if (index < parts.length - 1) {
                  const span = document.createElement('span');
                  span.textContent = word;
                  span.style.border = '3px solid red';
                  span.style.borderRadius = '50%';
                  span.style.padding = '1px 5px';
                  span.style.margin = '0 2.5px';
                  span.style.display = 'inline-block';
                  span.style.color = 'red';
                  span.style.fontWeight = 'bold';
                  fragment.appendChild(span);
                }
              });

              try {
                parent.replaceChild(fragment, node);
              } catch (e) {
                // 예외 처리 무시
              }
            });
          }, ocrKeywords);
        }

        const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
        
        fs.writeFileSync(filepath, screenshotBuffer);
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
// Google Cloud Vision API 백업 함수
async function detectAndDrawRedCircles(buffer, ocrKeywords) {
  return buffer;
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
        
        const baseName = path.basename(file, ext);
        const keyword = baseName.replace(/\s\d{4}\.\d{2}\.\d{2}$/, '').trim();
        const dateMatch = baseName.match(/\d{4}\.\d{2}\.\d{2}$/);
        const dateStr = dateMatch ? dateMatch[0] : getKstDateString();

        result.push({
          fileName: file,
          keyword: keyword,
          date: dateStr,
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

// 🌐 외부 노출용 cloudflared 퀵 터널 및 index.html 주소 동기화 푸시 로직
function updateIndexHtmlUrlAndPush(externalUrl) {
  const indexPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  
  let html = fs.readFileSync(indexPath, 'utf8');
  const regex = /let addr = '[^']+';/g;
  html = html.replace(regex, `let addr = '${externalUrl}';`);
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log(`[클라우드플레어 터널] index.html의 API 주소 갱신: ${externalUrl}`);
  
  const gitPath = process.platform === 'win32' ? '"C:\\Program Files\\Git\\cmd\\git.exe"' : 'git';
  const cmd = `${gitPath} add index.html && ${gitPath} commit -m "Update: Sync dynamic cloudflare tunnel API url" && ${gitPath} push`;
  
  exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error("[깃 자동푸시 실패]:", error.message);
      return;
    }
    console.log("[깃 자동푸시 성공] 외부 접속 주소가 깃허브(Pages)에 안전하게 배포되었습니다!");
  });
}

let cloudflareProcess = null;
function startCloudflareTunnel() {
  console.log("☁️ Cloudflare Quick Tunnel 개설 시도 중...");
  
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  cloudflareProcess = spawn(cmd, ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`]);
  
  cloudflareProcess.stdout.on('data', (data) => {
    handleTunnelLog(data.toString());
  });
  
  cloudflareProcess.stderr.on('data', (data) => {
    handleTunnelLog(data.toString());
  });
  
  cloudflareProcess.on('close', (code) => {
    console.log(`Cloudflare Tunnel 프로세스 종료. 코드: ${code}`);
  });
}

let tunnelInitialized = false;
function handleTunnelLog(log) {
  if (tunnelInitialized) return;
  
  // trycloudflare.com 외부 공인 도메인 검출
  const match = log.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    tunnelInitialized = true;
    const externalUrl = match[0];
    console.log(`🚀 Cloudflare 공인 주소 개설 성공 (경고창 없음): ${externalUrl}`);
    
    updateIndexHtmlUrlAndPush(externalUrl);
  }
}

app.listen(PORT, async () => {
  console.log(`수집 백엔드 서버 구동 완료: http://localhost:${PORT}`);
  startCloudflareTunnel();
});

// 프로세스 종료 시 백그라운드 터널링 프로세스도 함께 살해
process.on('exit', () => {
  if (cloudflareProcess) cloudflareProcess.kill();
});
process.on('SIGINT', () => {
  if (cloudflareProcess) cloudflareProcess.kill();
  process.exit();
});
