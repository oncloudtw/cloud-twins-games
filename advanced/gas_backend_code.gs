/**
 * 處理來自前端的 POST 請求
 */
function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var data = postData.data;

    switch (action) {
      case 'saveGameRecord':
        return saveGameRecord(data);
      case 'saveUserData':
        return saveUserData(data);
      case 'getUserData':
        return getUserData(data);
      case 'getLeaderboard':
        return getLeaderboard(data);
      default:
        return ContentService.createTextOutput(JSON.stringify({ 
          status: 'error', 
          message: 'Unknown action: ' + action 
        })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 處理 GET 請求 (可用來測試 API 是否活著)
 */
function doGet(e) {
  return ContentService.createTextOutput("Cloud Twins Games API is running.");
}

/**
 * 儲存遊戲通關紀錄 (原本的功能)
 */
function saveGameRecord(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('GameRecords');
    if (!sheet) {
      sheet = ss.insertSheet('GameRecords');
      sheet.appendRow(['Timestamp', 'Username', 'Game', 'Unit', 'Score', 'TimeSpent(s)', 'WrongAnswers']);
      sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#cfe2f3");
      sheet.setFrozenRows(1);
    }

    var timestamp = new Date();
    var wrongAnswersStr = data.wrongAnswers ? JSON.stringify(data.wrongAnswers) : "";

    sheet.appendRow([
      timestamp,
      data.username,
      data.game,
      data.unit,
      data.score,
      data.timeSpent,
      wrongAnswersStr
    ]);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      message: 'Game record saved successfully' 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 確保 UserData 頁籤存在 (新增的功能)
 */
function ensureUserDataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('UserData');
  if (!sheet) {
    sheet = ss.insertSheet('UserData');
    // 寫入標題列：Username, DataJSON, LastUpdated
    sheet.appendRow(['Username', 'DataJSON', 'LastUpdated']);
    sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#d9ead3");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 儲存學生的專屬資料 (錯題庫、生詞本等)
 * data 格式: { username: '姓名', payload: { ... } }
 */
function saveUserData(data) {
  try {
    var username = data.username;
    var payloadStr = JSON.stringify(data.payload);
    var timestamp = new Date();
    
    var sheet = ensureUserDataSheet();
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    
    var rowIndex = -1;
    // 從第 2 列開始尋找是否已經有該使用者的紀錄
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === username) {
        rowIndex = i + 1; // getRange 是 1-based
        break;
      }
    }
    
    if (rowIndex > -1) {
      // 更新現有資料
      sheet.getRange(rowIndex, 2).setValue(payloadStr);
      sheet.getRange(rowIndex, 3).setValue(timestamp);
    } else {
      // 找不到該使用者，新增一列
      sheet.appendRow([username, payloadStr, timestamp]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      message: 'User data saved successfully' 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 讀取學生的專屬資料
 * data 格式: { username: '姓名' }
 */
function getUserData(data) {
  try {
    var username = data.username;
    var sheet = ensureUserDataSheet();
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    
    var payloadStr = "{}";
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === username) {
        payloadStr = values[i][1];
        break;
      }
    }
    
    var payload = JSON.parse(payloadStr);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      data: payload 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 取得排行榜資料
 * data 格式: { game: '遊戲名稱' }
 */
function getLeaderboard(data) {
  try {
    var gameName = data.game;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('GameRecords');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'success', 
        data: [] 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'success', 
        data: [] 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var records = [];
    // Timestamp, Username, Game, Unit, Score, TimeSpent(s), WrongAnswers
    for (var i = 1; i < values.length; i++) {
      if (values[i][2] === gameName) {
        records.push({
          timestamp: values[i][0],
          username: values[i][1],
          unit: values[i][3],
          score: values[i][4],
          timeSpent: values[i][5]
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      data: records 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: e.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
