// =========================================================================
// API 端點與資料庫操作 (用於遊戲前端追蹤)
// =========================================================================

// 初始化工作表
function ensureSheetsExist() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  // Users
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.hideSheet();
    usersSheet.appendRow(['Username', 'Password', 'Role', 'CreatedAt']);
    usersSheet.getRange('A1:D1').setFontWeight('bold');
    // Default Admin
    usersSheet.appendRow(['admin', 'admin123', 'admin', new Date().toISOString()]);
  }
  
  // GameRecords
  let recordsSheet = ss.getSheetByName('GameRecords');
  if (!recordsSheet) {
    recordsSheet = ss.insertSheet('GameRecords');
    recordsSheet.hideSheet();
    recordsSheet.appendRow(['Timestamp', 'Username', 'Game', 'Unit', 'Score', 'TimeSpent', 'WrongAnswers']);
    recordsSheet.getRange('A1:G1').setFontWeight('bold');
  }
  
  // DictClicks
  let clicksSheet = ss.getSheetByName('DictClicks');
  if (!clicksSheet) {
    clicksSheet = ss.insertSheet('DictClicks');
    clicksSheet.hideSheet();
    clicksSheet.appendRow(['Timestamp', 'Username', 'Game', 'Word', 'DictType']);
    clicksSheet.getRange('A1:E1').setFontWeight('bold');
  }
}

// 處理 GET 請求
function doGet(e) {
  return handleRequest(e, 'GET');
}

// 處理 POST 請求
function doPost(e) {
  return handleRequest(e, 'POST');
}

// 支援跨網域的 Options 請求
function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e, method) {
  try {
    ensureSheetsExist();
    
    // GAS 處理 CORS 比較特別，前端最好用 GET，如果是 POST，通常需要把 data 變成字串或是用 JSON
    // 這裡我們支援這兩種方式解析
    let action = '';
    let data = {};
    
    if (e.postData && e.postData.contents) {
      const postBody = JSON.parse(e.postData.contents);
      action = postBody.action;
      data = postBody.data || {};
    } else if (e.parameter.action) {
      action = e.parameter.action;
      if (e.parameter.data) {
        data = JSON.parse(e.parameter.data);
      }
    }
    
    let result = {};
    
    switch (action) {
      case 'login':
        result = handleLogin(data);
        break;
      case 'saveGameRecord':
        result = handleSaveGameRecord(data);
        break;
      case 'logDictClick':
        result = handleLogDictClick(data);
        break;
      case 'getAdminData':
        result = handleGetAdminData(data);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    // Web Apps 預設處理 CORS，只要回傳 JSON 即可
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- 具體邏輯 ---

function handleLogin(data) {
  const username = (data.username || '').toString().trim();
  const password = (data.password || '').toString().trim();
  
  if (!username || !password) {
    return { success: false, error: '請輸入帳號與密碼' };
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Users');
  const values = sheet.getDataRange().getValues();
  
  // 找尋帳號
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == username) {
      // 帳號存在，檢查密碼
      if (values[i][1] == password) {
        return { success: true, role: values[i][2] || 'student' };
      } else {
        return { success: false, error: '密碼錯誤' };
      }
    }
  }
  
  // 帳號不存在，自動註冊為學生
  sheet.appendRow([username, password, 'student', new Date().toISOString()]);
  return { success: true, role: 'student', message: '已為您自動建立新帳號' };
}

function handleSaveGameRecord(data) {
  if (!data.username) return { success: false, error: 'Missing username' };
  
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('GameRecords');
  
  const wrongAnswersStr = Array.isArray(data.wrongAnswers) ? data.wrongAnswers.join(',') : (data.wrongAnswers || '');
  
  sheet.appendRow([
    new Date().toISOString(),
    data.username,
    data.game || '',
    data.unit || '',
    data.score || 0,
    data.timeSpent || 0,
    wrongAnswersStr
  ]);
  
  return { success: true };
}

function handleLogDictClick(data) {
  if (!data.username) return { success: false, error: 'Missing username' };
  
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('DictClicks');
  
  sheet.appendRow([
    new Date().toISOString(),
    data.username,
    data.game || '',
    data.word || '',
    data.dictType || ''
  ]);
  
  return { success: true };
}

function handleGetAdminData(data) {
  if (data.role !== 'admin') {
    return { success: false, error: 'Permission denied' };
  }
  
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  const getSheetData = (sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];
    const headers = values[0];
    return values.slice(1).map(row => {
      let obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
  };
  
  return {
    success: true,
    users: getSheetData('Users'),
    records: getSheetData('GameRecords'),
    clicks: getSheetData('DictClicks')
  };
}
