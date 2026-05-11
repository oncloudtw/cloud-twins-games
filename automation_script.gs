// =========================================================================
// 方寸語文教學：自動化流程腳本 (Google Apps Script)
// =========================================================================
// 部署說明：
// 1. 到 https://script.google.com/ 建立一個新專案
// 2. 將此程式碼貼上並覆蓋預設的 Code.gs
// 3. 填寫下方的【使用者設定區】的四個參數
// 4. 點擊上方的「執行」按鈕測試一次 (第一次執行需要授權)
// 5. 點擊左側時鐘圖示 (觸發條件)，設定排程 (例如：每天上午 8 點執行)
// =========================================================================

// --- 【使用者設定區】 ---
const CONFIG = {
  // 1. 請填入您要監控的 Google 雲端硬碟「共用資料夾」的 ID
  // (資料夾網址 https://drive.google.com/drive/folders/【這段英數字】 的部分)
  TARGET_FOLDER_ID: '請填寫資料夾ID',
  
  // 2. 目標試算表的 ID (已設定為您的試算表)
  SPREADSHEET_ID: '1ydMZu_8epF_gEQQ3IjVvbvOEstqehiP__wHsONd8alo',
  
  // 3. 您的 Gemini API Key (請至 Google AI Studio 免費申請)
  GEMINI_API_KEY: '請填寫GeminiAPIKey',
  
  // 4. 您的 NotebookLM 筆記本專屬網址
  NOTEBOOKLM_URL: 'https://notebooklm.google.com/',
  
  // 收件人名單 (用逗號分隔)
  EMAILS: '1110010@stu.qyes.tyc.edu.tw,1110028@stu.qyes.tyc.edu.tw,peggy1284@yahoo.com.tw',
  
  // 遊戲的部署網址 (若您放在 Google Sites，請填寫 Sites 網址)
  GAME_SITE_URL: 'https://sites.google.com/view/cloud-twins'
};

// --- 【主程式】 ---
function runAutomation() {
  Logger.log("開始執行自動化流程...");
  
  const folder = DriveApp.getFolderById(CONFIG.TARGET_FOLDER_ID);
  const files = folder.searchFiles('title contains "單元" and title contains "pdf" and trashed = false');
  
  // 取得已經處理過的檔案清單，避免重複處理
  const properties = PropertiesService.getScriptProperties();
  let processedFiles = properties.getProperty('PROCESSED_FILES');
  processedFiles = processedFiles ? JSON.parse(processedFiles) : [];
  
  let newFileFound = false;

  while (files.hasNext()) {
    const file = files.next();
    const fileId = file.getId();
    
    if (processedFiles.includes(fileId)) {
      continue; // 已經處理過了，跳過
    }
    
    Logger.log("找到新檔案：" + file.getName());
    newFileFound = true;
    
    try {
      // 1. 解析 PDF 並透過 Gemini API 擷取資料
      const extractedData = extractDataWithGemini(file);
      if (!extractedData || extractedData.length === 0) {
         Logger.log("無法從 PDF 擷取資料或資料為空。");
         continue;
      }
      
      // 2. 從檔名推測單元名稱 (例如 "第三單元筆記+Ans.pdf" -> "3")
      // 簡單轉換：將中文數字轉為阿拉伯數字 (若檔名已是數字則直接抓取)
      let unitName = extractUnitNumber(file.getName());
      
      // 3. 寫入 Google Sheets
      writeToSheet(unitName, extractedData);
      
      // 4. 發送通知 Email
      sendNotificationEmail(file, unitName);
      
      // 5. 標記為已處理
      processedFiles.push(fileId);
      properties.setProperty('PROCESSED_FILES', JSON.stringify(processedFiles));
      
      Logger.log("檔案處理完成：" + file.getName());
      
    } catch (e) {
      Logger.log("處理檔案時發生錯誤：" + e.toString());
      MailApp.sendEmail(Session.getActiveUser().getEmail(), "自動化腳本發生錯誤", "錯誤訊息：" + e.toString());
    }
  }
  
  if (!newFileFound) {
    Logger.log("沒有找到新的 PDF 檔案。");
  }
}

// 呼叫 Gemini API 處理 PDF
function extractDataWithGemini(file) {
  // 取得 PDF 的 Base64 編碼
  const blob = file.getBlob();
  const base64Data = Utilities.base64Encode(blob.getBytes());
  
  const prompt = `
請閱讀這份國語教學講義的 PDF 檔案（可能包含手寫筆記），並用 JSON 格式完整整理出所有「詞彙」和「成語」的內容。
必須輸出的 JSON 格式為陣列，每個物件包含以下鍵值 (請確切使用這些 Key，如果該項沒有資料請填空字串):
"類別" (例如: 詞彙, 成語)
"詞彙" (即詞彙或成語本身)
"注音" 
"字形" (即國字字形重點，若無則可同詞彙)
"解釋" (解釋與用法)
"例句" (例句或補充)

指令：請直接輸出 JSON 陣列，不要有任何 markdown 標記 (如 \`\`\`json) 或其他文字。確保是合法的 JSON。
  `;
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  
  const payload = {
    "contents": [{
      "parts": [
        {"text": prompt},
        {
          "inline_data": {
            "mime_type": "application/pdf",
            "data": base64Data
          }
        }
      ]
    }]
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  Logger.log("正在呼叫 Gemini API...");
  const response = UrlFetchApp.fetch(url, options);
  const jsonResponse = JSON.parse(response.getContentText());
  
  if (jsonResponse.error) {
    throw new Error("Gemini API Error: " + jsonResponse.error.message);
  }
  
  let rawText = jsonResponse.candidates[0].content.parts[0].text;
  
  // 清理可能包含的 markdown 標記
  rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    const data = JSON.parse(rawText);
    Logger.log(`成功解析出 ${data.length} 筆資料`);
    return data;
  } catch (e) {
    Logger.log("JSON 解析失敗，原始文字：" + rawText);
    throw new Error("Gemini 回傳的資料無法解析為 JSON");
  }
}

// 寫入 Google Sheets
function writeToSheet(sheetName, data) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  
  // 若該單元的工作表不存在，則建立新的
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    // 若已存在，先清空資料
    sheet.clear();
  }
  
  // 設定標題列
  const headers = ["類別", "詞彙", "注音", "字形", "解釋", "例句"];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#D1D5DB");
  
  // 整理資料為 2D 陣列
  const rows = data.map(item => [
    item["類別"] || "",
    item["詞彙"] || "",
    item["注音"] || "",
    item["字形"] || "",
    item["解釋"] || "",
    item["例句"] || ""
  ]);
  
  // 批次寫入資料
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  // 整理表格排版 (調整欄寬、自動折行)
  sheet.setColumnWidth(1, 80);  // 類別
  sheet.setColumnWidth(2, 120); // 詞彙
  sheet.setColumnWidth(3, 150); // 注音
  sheet.setColumnWidth(4, 120); // 字形
  sheet.setColumnWidth(5, 300); // 解釋
  sheet.setColumnWidth(6, 300); // 例句
  
  // 設定自動折行與垂直置中
  const dataRange = sheet.getDataRange();
  dataRange.setWrap(true);
  dataRange.setVerticalAlignment("middle");
  
  // 設定框線
  dataRange.setBorder(true, true, true, true, true, true);
  
  Logger.log(`資料已寫入工作表 [${sheetName}]`);
}

// 發送通知 Email
function sendNotificationEmail(file, unitName) {
  const subject = "方寸語文教學：字音字形成語的練習與遊戲 (第 " + unitName + " 單元更新)";
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit`;
  
  // 組合遊戲連結 (附帶單元參數)
  const gameUrl = `${CONFIG.GAME_SITE_URL}?unit=${unitName}`;
  
  const body = `
各位好，

最新的國語單元資料已自動處理完畢，請參考以下連結：

1. 📄 原始講義 (PDF 下載): ${file.getUrl()}
2. 🤖 NotebookLM (請手動上傳 PDF 以備份知識庫): ${CONFIG.NOTEBOOKLM_URL}
3. 📊 整理後的詞彙與成語表格: ${spreadsheetUrl}

🎮 本單元互動遊戲：
您可以直接前往我們的 Google Sites 進行遊戲測試：
${gameUrl}
(遊戲會自動讀取試算表中的「第 ${unitName} 單元」作為題庫)

本信件由系統自動發送。
  `;
  
  MailApp.sendEmail(CONFIG.EMAILS, subject, body);
  Logger.log("Email 發送完成！");
}

// 輔助函式：從檔名提取單元數字
function extractUnitNumber(filename) {
  // 尋找中文數字 (一到十) 或阿拉伯數字
  const match = filename.match(/第([一二三四五六七八九十\d]+)單元/);
  if (match && match[1]) {
    const numMap = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'};
    return numMap[match[1]] || match[1];
  }
  // 找不到就回傳當前日期作為工作表名稱，避免錯誤
  const d = new Date();
  return `${d.getMonth()+1}-${d.getDate()}`;
}
