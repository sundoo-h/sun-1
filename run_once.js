const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

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

async function run() {
  console.log("1회성 수동 캡처를 시작합니다...");
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const schedule = config.schedules[0];
  if (!schedule) {
    console.error("스케줄 설정이 비어있습니다.");
    return;
  }
  
  const naverKeywords = schedule.naverKeywords || [];
  const ocrKeywords = schedule.ocrKeywords || [];
  const saveDir = "D:\\screenshot";
  
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  
  const browserPath = getBrowserPath();
  if (!browserPath) {
    console.error("크롬 브라우저를 찾을 수 없습니다.");
    return;
  }
  
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const dateStr = "2026.07.18"; // 7월 18일자 생성 고정
  
  for (const keyword of naverKeywords) {
    const cleanKeyword = keyword.trim();
    const filename = `${cleanKeyword} ${dateStr}.jpg`;
    const filepath = path.join(saveDir, filename);
    console.log(`[시작] "${cleanKeyword}" 수집 중...`);
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(cleanKeyword)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // 스크롤
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
      
      // 푸터만 감추기
      await page.addStyleTag({
        content: `
          #footer, footer, .u_ft, .footer_wrap {
            display: none !important;
          }
        `
      });
      
      await new Promise(r => setTimeout(r, 2000));
      
      // OCR DOM 표시
      if (ocrKeywords.length > 0) {
        await page.evaluate((keywords) => {
          const cleanKeywords = keywords.map(k => k.trim()).filter(k => k.length > 0);
          if (cleanKeywords.length === 0) return;
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
          const nodesToReplace = [];
          let node;
          while (node = walker.nextNode()) {
            const text = node.nodeValue;
            const parent = node.parentNode;
            if (!parent) continue;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName.toUpperCase())) continue;
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
              if (part) fragment.appendChild(document.createTextNode(part));
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
            try { parent.replaceChild(fragment, node); } catch(e) {}
          });
        }, ocrKeywords);
      }
      
      const buffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
      fs.writeFileSync(filepath, buffer);
      console.log(`[완료] 저장 완료: ${filename}`);
      await page.close();
    } catch (e) {
      console.error(`[오류] "${cleanKeyword}" 실패:`, e.message);
    }
  }
  
  await browser.close();
  console.log("모든 키워드 1회성 캡처 작업이 완료되었습니다!");
}

run();
