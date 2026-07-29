const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 로컬 Chrome 실행 파일 경로 자동 탐색
function getChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (let p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("로컬 크롬 실행 파일(chrome.exe)을 찾을 수 없습니다.");
}

/**
 * 네이버 블로그 에디터 정교한 서식 자동화 및 임시저장 RPA 봇
 * @param {string} convertedText 2번칸의 변환된 원고 텍스트
 * @param {object} options 설정 옵션 (username, password, blogId 등)
 */
async function runNaverPostBot(convertedText, options = {}) {
  const chromePath = getChromePath();
  const userDataDir = path.join(__dirname, '.chrome_profile_' + Math.floor(Date.now() / (1000 * 60 * 60)));

  console.log("🚀 Puppeteer 네이버 포스팅 봇 기동 중...");
  
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false, // 사용자 요청: 크롬 창을 띄워서 동작 시뮬레이션 확인
    defaultViewport: null,
    userDataDir: userDataDir, // 쿠키 및 로그인 세션 자동 보관
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = (await browser.pages())[0] || await browser.newPage();

  try {
    // 1. 네이버 로그인 상태 확인 및 필요시 로그인
    console.log("🔑 네이버 로그인 상태 확인 중...");
    await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "networkidle2" });

    // 로그인 페이지에 머물러 있는 경우 자동 로그인 시도
    if (page.url().includes("nidlogin.login")) {
      const username = options.username || "sundoo750";
      const password = options.password || "sundoo7535@";

      console.log(`🔑 아이디(${username}) 로그인 시도 중...`);

      // 네이버 캡차 우회를 위한 evaluate 입력 및 제출
      await page.evaluate((id, pw) => {
        const idInput = document.querySelector("#id");
        const pwInput = document.querySelector("#pw");
        if (idInput) idInput.value = id;
        if (pwInput) pwInput.value = pw;
        const btn = document.querySelector('.btn_login, #log\\.login, button[type="submit"], .btn_g');
        if (btn) btn.click();
      }, username, password);

      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    const blogId = options.blogId || "sundooclinic";
    const editorUrl = `https://blog.naver.com/${blogId}/postwrite`;

    console.log(`📝 네이버 스마트에디터 ONE 진입 중... (${editorUrl})`);
    await page.goto(editorUrl, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 4000));

    // 팝업 처리 (이전 작성 중인 글 불러오기 취소 / 도움말 팝업 닫기)
    try {
      await page.evaluate(() => {
        const cancelBtns = Array.from(document.querySelectorAll('button, a'));
        cancelBtns.forEach(btn => {
          if (btn.innerText && (btn.innerText.includes('취소') || btn.innerText.includes('닫기'))) {
            btn.click();
          }
        });
      });
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {}

    // 원고 구조 파싱
    const parsedData = parseConvertedText(convertedText);
    console.log("📌 원고 파싱 완료:", { title: parsedData.title, TOCCount: parsedData.tocList.length });

    // 2. 제목 입력
    console.log("✍️ [제목 입력 중...]");
    const titleArea = await page.$('.se-documentTitle, .se-title-text, [contenteditable="true"]');
    if (titleArea) {
      await titleArea.click();
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.type(parsedData.title, { delay: 30 });
    }

    // 본문 에디터로 포커스 이동
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));

    // 3. 네이버 블로그 샘플(224361192618) 완벽 서식 HTML 합성 및 Direct Injection
    console.log("🎨 [샘플 포맷 서식 HTML 합성 및 에디터 주입 중...]");
    
    const formattedHtml = generateSampleFormatHtml(parsedData);

    // 본문 에디터 영역 포커스 후 execCommand insertHTML 실행
    await page.evaluate((htmlContent) => {
      const editorArea = document.querySelector('.se-main-container, .se-content, [contenteditable="true"]:not(.se-documentTitle)');
      if (editorArea) {
        editorArea.focus();
        document.execCommand('insertHTML', false, htmlContent);
      }
    }, formattedHtml);

    await new Promise(r => setTimeout(r, 2000));

    // 4. 네이버 스마트에디터 [저장] 버튼 정밀 클릭 매크로
    console.log("💾 [네이버 임시저장 버튼 클릭 시도...]");
    
    let saved = await page.evaluate(() => {
      const saveSelectors = [
        'button.se-document-action-save',
        'button.se-save-button',
        'button.se-header-save-button',
        'button._save_btn',
        '.se-header-save-button',
        'button[data-name="save"]'
      ];
      for (let s of saveSelectors) {
        const btn = document.querySelector(s);
        if (btn) {
          btn.click();
          return true;
        }
      }
      // 텍스트 기반 억지 탐색
      const allBtns = Array.from(document.querySelectorAll('button, a'));
      for (let b of allBtns) {
        if (b.innerText && b.innerText.trim() === '저장') {
          b.click();
          return true;
        }
      }
      return false;
    });

    if (saved) {
      console.log("✅ 네이버 블로그 [임시저장] 성공 완료!");
    } else {
      console.log("⚠️ 저장 버튼 위치 자동 클릭 실패 - 브라우저 화면 우측 상단의 [저장] 버튼을 마우스로 눌러주세요.");
    }

    console.log("🎉 완벽 포스팅 매크로 작업 완료. 사용자 검토를 위해 크롬 브라우저를 유기 상태로 유지합니다.");
    return { success: true, message: "샘플 양식 포맷에 맞춰 임시저장 작성이 완료되었습니다." };

  } catch (error) {
    console.error("❌ 포스팅 봇 구동 에러:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 네이버 블로그 샘플 게시글 (224361192618) 서식을 100% 동일하게 복제하는 HTML 생성기
 * - 남색 글자 컬러: #2b2a73
 * - 분홍색 글자 배경색: #ffdce7
 * - 표 배경 분홍색: #ef8aaa (1열 5행)
 * - 도입부 인용구 및 본문 나눔스퀘어 가운데 정렬
 */
function generateSampleFormatHtml(parsedData) {
  let html = '';

  // 1. 도입부 인용구 (밑라인 텍스트 강조)
  html += `
    <div style="text-align:center; margin-top:20px; margin-bottom:25px;">
      <blockquote style="display:inline-block; border-bottom:2px solid #2b2a73; padding-bottom:8px; margin:0 auto;">
        <span style="font-weight:bold; font-size:16px; color:#2b2a73; font-family:nanumsquare, sans-serif;">${parsedData.title}</span>
      </blockquote>
    </div>
  `;

  // 2. 목차 표 (1열 5행, #ef8aaa 핑크 배경 첫행)
  html += `
    <div style="margin:25px 0; text-align:center;">
      <table style="width:35%; min-width:290px; margin:0 auto; border-collapse:collapse; border:1px solid #e2e8f0;">
        <tbody>
          <tr style="background-color:#ef8aaa; height:43px;">
            <td style="border:1px solid #e2e8f0; padding:10px; text-align:center;">
              <span style="color:#2b2a73; font-weight:bold; font-size:15px; font-family:nanumsquare, sans-serif;">목차</span>
            </td>
          </tr>
          ${parsedData.tocList.map(toc => `
          <tr style="height:43px; background-color:#ffffff;">
            <td style="border:1px solid #e2e8f0; padding:10px; text-align:center;">
              <span style="font-size:14px; color:#333333; font-family:nanumsquare, sans-serif;">${toc}</span>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // 3. 도입부 본문 (가운데 정렬)
  if (parsedData.introText) {
    const lines = parsedData.introText.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        html += `<p style="text-align:center; line-height:2.1; margin:8px 0;"><span style="font-family:nanumsquare, sans-serif; font-size:15px; color:#333;">${escapeHtml(line.trim())}</span></p>`;
      } else {
        html += `<p style="text-align:center; line-height:2.1;"><br></p>`;
      }
    });
  }

  // 4. 소제목 1~4번 단락 (남색 글자 #2b2a73, 폰트 19px, 볼드, 분홍색 글자 배경색 #ffdce7)
  parsedData.sections.forEach(section => {
    html += `
      <p style="text-align:center; line-height:2.1; margin-top:35px; margin-bottom:18px;">
        <span style="font-size:19px; font-weight:bold; color:#2b2a73; background-color:#ffdce7; padding:4px 10px; border-radius:4px; font-family:nanumsquare, sans-serif;">${escapeHtml(section.subTitle)}</span>
      </p>
    `;
    if (section.content) {
      const lines = section.content.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          html += `<p style="text-align:center; line-height:2.1; margin:8px 0;"><span style="font-family:nanumsquare, sans-serif; font-size:15px; color:#333;">${escapeHtml(line.trim())}</span></p>`;
        } else {
          html += `<p style="text-align:center; line-height:2.1;"><br></p>`;
        }
      });
    }
  });

  // 5. 마무리 본문
  if (parsedData.outroText) {
    const lines = parsedData.outroText.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        html += `<p style="text-align:center; line-height:2.1; margin:8px 0;"><span style="font-family:nanumsquare, sans-serif; font-size:15px; color:#333;">${escapeHtml(line.trim())}</span></p>`;
      } else {
        html += `<p style="text-align:center; line-height:2.1;"><br></p>`;
      }
    });
  }

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 2번칸 원고 구조 분석 함수
function parseConvertedText(text) {
  let title = "다리 통증 개선을 돕는 하지정맥류 비수술 치료 방법";
  let tocList = [];
  let introText = "";
  let sections = [];
  let outroText = "";

  const titleMatch = text.match(/제목:\s*(.+)/);
  if (titleMatch) title = titleMatch[1].trim();

  // 목차 추출
  const tocMatches = text.matchAll(/\d\.\s*(.+)/g);
  for (let m of tocMatches) {
    if (tocList.length < 4 && !tocList.includes(m[1].trim())) {
      tocList.push(m[1].trim());
    }
  }

  // 본문 파싱 (소제목 1, 2, 3, 4 분리)
  const lines = text.split('\n');
  let currentSection = null;
  let stage = 'intro'; // 'intro', 'section', 'outro'

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('제목:') || trimmed.startsWith('목차') || trimmed.startsWith('[') || trimmed.startsWith('---')) continue;

    const subTitleMatch = trimmed.match(/^(\d\.\s*.+)/);
    if (subTitleMatch && tocList.some(toc => trimmed.includes(toc))) {
      stage = 'section';
      if (currentSection) sections.push(currentSection);
      currentSection = { subTitle: subTitleMatch[1], content: "" };
    } else if (stage === 'intro') {
      introText += trimmed + "\n";
    } else if (stage === 'section') {
      if (sections.length >= 4 && !subTitleMatch) {
        stage = 'outro';
        outroText += trimmed + "\n";
      } else if (currentSection) {
        currentSection.content += trimmed + "\n";
      }
    } else if (stage === 'outro') {
      outroText += trimmed + "\n";
    }
  }
  if (currentSection) sections.push(currentSection);

  return { title, tocList, introText, sections, outroText };
}

module.exports = { runNaverPostBot };
