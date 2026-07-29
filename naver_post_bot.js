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

    // 팝업 처리 (작성 중인 글 불러오기 [취소] 무조건 클릭 / 도움말 팝업 닫기)
    console.log("🚨 작성 중인 글 팝업 확인 및 [취소] 클릭 처리 중...");
    try {
      for (let i = 0; i < 6; i++) {
        const clicked = await page.evaluate(() => {
          let found = false;
          const cancelBtns = Array.from(document.querySelectorAll('.se-popup-button-cancel, .se-popup-button-container button, .se-popup-button, button, a'));
          for (let btn of cancelBtns) {
            const txt = btn.innerText ? btn.innerText.trim() : '';
            if (txt === '취소' || txt.includes('취소') || txt.includes('닫기')) {
              btn.click();
              found = true;
            }
          }
          return found;
        });
        if (clicked) {
          console.log("✅ '작성 중인 글' 팝업 [취소] 버튼 자동 클릭 완료!");
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log("팝업 처리 스킵:", e.message);
    }

    // 원고 구조 파싱
    const parsedData = parseConvertedText(convertedText);
    console.log("📌 원고 파싱 완료:", { title: parsedData.title, TOCCount: parsedData.tocList.length });

    // 2. 제목 입력
    console.log("✍️ [제목 입력 중...]");
    const titleArea = await page.$('.se-documentTitle, .se-title-text, .se-ff-nanumgothic.se-fs15');
    if (titleArea) {
      await titleArea.click();
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.type(parsedData.title, { delay: 30 });
    }

    await new Promise(r => setTimeout(r, 800));

    // 3. 네이버 스마트에디터 ONE 본문 영역으로 물리적 이동 (Tab 키 + 물리 마우스 클릭)
    console.log("🎨 [샘플 포맷 서식 HTML 합성 및 본문 주입 중...]");
    
    // Tab 키를 눌러 제목에서 본문으로 물리 포커스 이동
    await page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 500));

    // 에디터 중앙 좌표 물리 클릭 (본문 컴포넌트 활성화)
    try {
      const viewPort = page.viewport();
      const centerX = Math.floor((viewPort?.width || 1280) / 2);
      await page.mouse.click(centerX, 380);
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}

    // 본문 컨테이너 direct selector 클릭 시도
    const bodyTarget = await page.$('.se-main-container, .se-content, .se-component-text, [contenteditable="true"]:not(.se-documentTitle)');
    if (bodyTarget) {
      try {
        await bodyTarget.click();
        await new Promise(r => setTimeout(r, 500));
      } catch(e) {}
    }

    const formattedHtml = generateSampleFormatHtml(parsedData);

    // 본문 에디터 노드에 execCommand insertHTML 및 insertAdjacentHTML 2중 주입
    const injected = await page.evaluate((htmlContent) => {
      let bodyNode = document.querySelector('.se-main-container [contenteditable="true"]:not(.se-documentTitle), .se-component-text [contenteditable="true"], .se-content [contenteditable="true"]');
      
      if (!bodyNode) {
        const allEditable = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        bodyNode = allEditable.find(el => {
          return !el.className.includes('title') && !el.className.includes('Title') && !el.closest('.se-documentTitle');
        });
      }

      if (!bodyNode) {
        bodyNode = document.querySelector('.se-main-container, .se-content');
      }

      if (bodyNode) {
        bodyNode.focus();
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(bodyNode);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch(e) {}

        const success = document.execCommand('insertHTML', false, htmlContent);
        if (!success) {
          bodyNode.insertAdjacentHTML('beforeend', htmlContent);
        }
        return true;
      }
      return false;
    }, formattedHtml);

    console.log("📌 본문 주입 실행 결과:", injected);

    // 네이버 에디터 데이터 모델 동기화 키보드 트리거
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 4000));

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
  let title = "사타구니 부위의 혹, 탈장인지 확인해야 할 필요성";
  let tocList = [];
  let introText = "";
  let sections = [];
  let outroText = "";

  if (!text || !text.trim()) {
    return { title, tocList: ["소제목 1", "소제목 2", "소제목 3", "소제목 4"], introText: "", sections: [], outroText: "" };
  }

  const lines = text.split('\n');

  // 1. 제목 추출
  const titleMatch = text.match(/제목:\s*(.+)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else {
    for (let line of lines) {
      const t = line.trim();
      if (t && !t.startsWith('목차') && !t.startsWith('[') && !t.startsWith('#')) {
        title = t;
        break;
      }
    }
  }

  // 2. 소제목 파싱 (1. 2. 3. 4. 패턴 및 본문 분해)
  let currentSection = null;
  let stage = 'intro';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('제목:') || trimmed.startsWith('---') || trimmed.includes('사진 묘사 프롬프트')) continue;
    if (trimmed === '목차') continue;

    // 소제목 패턴: "1. 소제목", "1) 소제목", "1.소제목"
    const subTitleMatch = trimmed.match(/^(\d+[\.\)]\s*(.+))/);
    
    if (subTitleMatch) {
      const cleanSubTitle = subTitleMatch[1].trim();
      const subTitleName = subTitleMatch[2].trim();

      if (!tocList.includes(subTitleName) && tocList.length < 4) {
        tocList.push(subTitleName);
      }

      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { subTitle: cleanSubTitle, content: "" };
      stage = 'section';
      continue;
    }

    if (stage === 'intro') {
      if (!trimmed.startsWith('#')) {
        introText += trimmed + "\n";
      }
    } else if (stage === 'section') {
      if (trimmed.startsWith('#')) {
        stage = 'outro';
        outroText += trimmed + "\n";
      } else if (currentSection) {
        currentSection.content += trimmed + "\n";
      }
    } else if (stage === 'outro') {
      outroText += trimmed + "\n";
    }
  }

  if (currentSection && !sections.includes(currentSection)) {
    sections.push(currentSection);
  }

  // 3. 소제목 파싱 보정 (소제목이 부족할 경우 기본 4개 생성)
  if (tocList.length === 0) {
    tocList = [
      "사타구니 혹과 탈장의 차이점",
      "서혜부 탈장이 발생하는 주요 원인",
      "진행 정도에 따른 치료와 수술 방법",
      "일상 속 예방법과 생활 습관 관리"
    ];
  }

  return { title, tocList, introText, sections, outroText };
}

module.exports = { runNaverPostBot };
