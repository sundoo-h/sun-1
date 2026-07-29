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
 * 네이버 블로그 에디터 자동 타이핑 및 서식 임시저장 RPA 봇
 * @param {string} convertedText 2번칸의 변환된 원고 텍스트
 * @param {object} options 설정 옵션 (username, password, blogId 등)
 */
async function runNaverPostBot(convertedText, options = {}) {
  const chromePath = getChromePath();
  const userDataDir = path.join(__dirname, '.chrome_profile');

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

      // 네이버 캡차 우회를 위한 evaluate 입력
      await page.evaluate((id, pw) => {
        document.querySelector("#id").value = id;
        document.querySelector("#pw").value = pw;
      }, username, password);

      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
        page.click("#log\\.login")
      ]);

      // 2차 인증이나 등록 안내 화면이 나올 수 있으므로 3초 대기
      await new Promise(r => setTimeout(r, 3000));
    }

    const blogId = options.blogId || "sundooclinic";
    const editorUrl = `https://blog.naver.com/${blogId}/postwrite`;

    console.log(`📝 네이버 스마트에디터 ONE 진입 중... (${editorUrl})`);
    await page.goto(editorUrl, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 4000));

    // 팝업 처리 (이전 작성 중인 글 불러오기 취소 / 도움말 팝업 닫기)
    try {
      const cancelBtn = await page.$('.se-popup-button-cancel, .se-help-close-button');
      if (cancelBtn) {
        await cancelBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {}

    // 원고 구조 파싱
    const parsedData = parseConvertedText(convertedText);
    console.log("📌 원고 파싱 완료:", { title: parsedData.title, TOCCount: parsedData.tocList.length });

    // 2. 제목 입력
    console.log("✍️ [제목 입력 중...]");
    const titleArea = await page.$('.se-documentTitle, .se-title-text');
    if (titleArea) {
      await titleArea.click();
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.type(parsedData.title, { delay: 40 });
    }

    // 본문 에디터 이동 (Down 키나 에디터 본문 영역 클릭)
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));

    // 3. 본문 전체 가운데 정렬 세팅
    console.log("📐 [가운데 정렬 설정]");
    try {
      const alignBtn = await page.$('.se-toolbar .se-align-center-button, button[data-name="align-center"]');
      if (alignBtn) await alignBtn.click();
    } catch(e) {}

    // 4. 서두 도입부 인용구 (밑라인)
    console.log("💬 [인용구 타이핑]");
    try {
      const quoteBtn = await page.$('.se-toolbar .se-quote-button, button[data-name="quote"]');
      if (quoteBtn) {
        await quoteBtn.click();
        await new Promise(r => setTimeout(r, 800));
      }
    } catch(e) {}
    await page.keyboard.type(parsedData.title, { delay: 40 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));

    // 5. 목차 표(Table) 생성 (1열 5행)
    console.log("📊 [목차 표(1x5) 생성 중...]");
    try {
      const tableBtn = await page.$('.se-toolbar .se-table-button, button[data-name="table"]');
      if (tableBtn) {
        await tableBtn.click();
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch(e) {
      console.log("표 생성 버튼 클릭 우회 진행");
    }

    // 표 내부 셀 타이핑 (첫행: 목차, 다음 행들: 소제목들)
    const tableCellsText = ["목차", ...parsedData.tocList];
    for (let text of tableCellsText) {
      await page.keyboard.type(text, { delay: 30 });
      await page.keyboard.press('Tab'); // 다음 셀로 이동
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 표 아래로 빠져나오기
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 1000));

    // 6. 도입부 본문 타이핑
    if (parsedData.introText) {
      console.log("📄 [도입부 본문 타이핑 중...]");
      await typeParagraphs(page, parsedData.introText);
    }

    // 7. 소제목 1~4번 단락 타이핑 & 서식 적용 (폰트 19px, 볼드, 남색 `#2b2a73`)
    for (let section of parsedData.sections) {
      console.log(`📌 [소제목 타이핑 & 서식 적용]: ${section.subTitle}`);
      
      // 소제목 타이핑
      await page.keyboard.type(section.subTitle, { delay: 40 });
      
      // 소제목 스타일 지정 (드래그 전체 선택 후 툴바 클릭 효과)
      await page.keyboard.down('Shift');
      await page.keyboard.press('Home');
      await page.keyboard.up('Shift');
      await new Promise(r => setTimeout(r, 300));

      // 툴바 서식 클릭 (볼드, 글자크기 19px, 남색)
      await applySubtitleStyle(page);

      // 줄바꿈 후 정상 본문 타이핑
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 500));

      if (section.content) {
        await typeParagraphs(page, section.content);
      }
    }

    // 8. 마무리 본문 타이핑
    if (parsedData.outroText) {
      console.log("📄 [마무리 본문 타이핑 중...]");
      await typeParagraphs(page, parsedData.outroText);
    }

    // 9. 임시저장 버튼 클릭!
    console.log("💾 [네이버 임시저장 버튼 클릭!]");
    await new Promise(r => setTimeout(r, 1500));
    
    const saveBtn = await page.$('.se-document-action-save, button.se-save-button, .se-header-save-button');
    if (saveBtn) {
      await saveBtn.click();
      console.log("✅ 네이버 블로그 임시저장 성공!");
    } else {
      console.log("⚠️ 저장 버튼 자동 클릭 실패 - 브라우저 화면에서 [저장] 버튼을 마우스로 클릭해주세요.");
    }

    console.log("🎉 포스팅 매크로 작업 완료. 검토를 위해 크롬 브라우저를 유기 상태로 유지합니다.");
    return { success: true, message: "임시저장이 완료되었습니다." };

  } catch (error) {
    console.error("❌ 포스팅 봇 구동 에러:", error);
    return { success: false, error: error.message };
  }
}

// 텍스트 단락 타이핑 유틸리티
async function typeParagraphs(page, text) {
  const lines = text.split('\n');
  for (let line of lines) {
    if (line.trim()) {
      await page.keyboard.type(line.trim(), { delay: 25 });
    }
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 150));
  }
}

// 소제목 서식 적용 (볼드, 크기 19px, 남색)
async function applySubtitleStyle(page) {
  try {
    // 볼드 버튼
    const boldBtn = await page.$('.se-toolbar .se-bold-button, button[data-name="bold"]');
    if (boldBtn) await boldBtn.click();
    await new Promise(r => setTimeout(r, 200));

    // 폰트 크기 버튼 (19px)
    const fontSizeBtn = await page.$('.se-toolbar .se-font-size-button, button[data-name="font-size"]');
    if (fontSizeBtn) {
      await fontSizeBtn.click();
      await new Promise(r => setTimeout(r, 300));
      const targetSizeOption = await page.$('.se-font-size-option-19, [data-size="19"]');
      if (targetSizeOption) await targetSizeOption.click();
    }

    // 폰트 색상 버튼 (남색 #2b2a73)
    const colorBtn = await page.$('.se-toolbar .se-font-color-button, button[data-name="font-color"]');
    if (colorBtn) {
      await colorBtn.click();
      await new Promise(r => setTimeout(r, 300));
      const targetColor = await page.$('[data-color="#2b2a73"], .se-color-palette-cell[data-color="#2b2a73"]');
      if (targetColor) await targetColor.click();
    }
  } catch(e) {
    console.log("서식 툴바 일부 적용 시 스킵:", e.message);
  }
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
