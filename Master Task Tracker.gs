// ===================================
// TASK DASHBOARD - APPS SCRIPT BACKEND
// ===================================

// Configuration
const SHEET_NAME = 'Master Sheet'; // Change this to your actual sheet name
const TASK_ID_PREFIX = 'Task-'; // Updated prefix

// Column indices (0-based for array access, but 1-based for sheet operations)
const COL = {
  TASK_ID: 0,
  CLIENT: 1,
  TASK_TITLE: 2,
  DESCRIPTION: 3,
  PRIORITY: 4,
  DUE_DATE: 5,
  STATUS: 6,
  COMPLETED_DATE: 7,
  NOTES: 8,
  LEAD: 9,
  SUPPORT: 10,
  LAST_UPDATED: 11,   // Now records WHICH column was changed
  ASSIGNED: 12,       // Comma separated Lead + Support
  LAST_EDITED_BY: 13, // Records the exact user making the edit
  LAST_SYNC_TIME: 14  // Records exact Time of edit
};

// ===================================
// WEB APP ENTRY POINT
// ===================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('CO Dashboard v1')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/keep_2020q4_48dp.png');
}

// ===================================
// API ENDPOINTS
// ===================================

function getTasks(userName) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found: ' + SHEET_NAME };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, tasks: [] };
    }
    
    // Skip header row
    let tasks = data.slice(1).map((row, index) => {
      // Safely handle old Date values sitting in the Last Updated column
      let lastUpdatedVal = row[COL.LAST_UPDATED];
      if (lastUpdatedVal instanceof Date) {
        lastUpdatedVal = formatDateTime(lastUpdatedVal);
      } else {
        lastUpdatedVal = lastUpdatedVal ? String(lastUpdatedVal) : '';
      }

      // Convert everything strictly to strings to prevent Apps Script serialization crashes
      return {
        rowIndex: index + 2, // +2 because we skip header and arrays are 0-indexed
        taskId: row[COL.TASK_ID] ? String(row[COL.TASK_ID]) : '',
        client: row[COL.CLIENT] ? String(row[COL.CLIENT]) : '',
        taskTitle: row[COL.TASK_TITLE] ? String(row[COL.TASK_TITLE]) : '',
        description: row[COL.DESCRIPTION] ? String(row[COL.DESCRIPTION]) : '',
        priority: row[COL.PRIORITY] ? String(row[COL.PRIORITY]) : '',
        dueDate: row[COL.DUE_DATE] ? formatDate(row[COL.DUE_DATE]) : '',
        status: row[COL.STATUS] ? String(row[COL.STATUS]) : '',
        completedDate: row[COL.COMPLETED_DATE] ? formatDate(row[COL.COMPLETED_DATE]) : '',
        notes: row[COL.NOTES] ? String(row[COL.NOTES]) : '',
        lead: row[COL.LEAD] ? String(row[COL.LEAD]) : '',
        support: row[COL.SUPPORT] ? String(row[COL.SUPPORT]) : '',
        lastUpdated: lastUpdatedVal,
        assigned: row[COL.ASSIGNED] ? String(row[COL.ASSIGNED]) : '',
        lastEditedBy: row[COL.LAST_EDITED_BY] ? String(row[COL.LAST_EDITED_BY]) : '',
        lastSyncTime: row[COL.LAST_SYNC_TIME] ? formatDateTime(row[COL.LAST_SYNC_TIME]) : ''
      };
    }).filter(task => task.taskId); // Filter out empty rows
    
    // Filter by user if not MASTER TRACKER (case-insensitive)
    if (userName && userName !== 'MASTER TRACKER') {
      tasks = tasks.filter(task => {
        const assigned = (task.assigned || '').toLowerCase();
        const lead = (task.lead || '').toLowerCase();
        const support = (task.support || '').toLowerCase();
        const user = userName.toLowerCase();
        
        return assigned.includes(user) || lead === user || support.includes(user);
      });
    }
    
    return { success: true, tasks: tasks };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addTask(taskData) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000); 
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    // Prioritize user selected in the Web App interface, fallback to Master Tracker
    let userName = taskData.currentUser || taskData.userName || taskData.lastEditedBy;
    if (!userName) {
      userName = 'Master Tracker';
    }
    
    const now = new Date();
    
    // strictly sequential: MAX + 1
    const currentMax = getMaxTaskId(sheet);
    const taskId = TASK_ID_PREFIX + String(currentMax + 1).padStart(3, '0');
    
    // Formatted strictly with commas
    const assigned = formatAssigned(taskData.lead, taskData.support);
    
    // Create new row
    const newRow = [
      taskId,
      taskData.client || '',
      taskData.taskTitle || '',
      taskData.description || '',
      taskData.priority || 'Medium',
      taskData.dueDate || '',
      taskData.status || 'Not Started',
      '', // Completed Date
      taskData.notes || '',
      taskData.lead || '',
      taskData.support || '',
      'New Task', // Last Updated records event instead of date
      assigned,
      userName,
      now // Last Sync Time
    ];
    
    sheet.appendRow(newRow);
    
    return { 
      success: true, 
      taskId: taskId,
      message: 'Task created successfully'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateTask(taskData) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    // Prioritize user selected in the Web App interface
    let userName = taskData.currentUser || taskData.userName || taskData.lastEditedBy;
    if (!userName) {
      userName = 'Master Tracker';
    }
    
    const now = new Date();
    
    // Find the row by Task ID
    const data = sheet.getDataRange().getValues();
    const headers = data[0]; // Row 1 headers
    let rowIndex = -1;
    let oldRow = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][COL.TASK_ID] === taskData.taskId) {
        rowIndex = i + 1; // +1 for 1-based indexing
        oldRow = data[i];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Task not found: ' + taskData.taskId };
    }
    
    // IDENTIFY CHANGED COLUMNS
    const safeStr = (val) => (val === null || val === undefined) ? '' : String(val).trim();
    let changedCols = [];
    
    if (taskData.client !== undefined && safeStr(taskData.client) !== safeStr(oldRow[COL.CLIENT])) changedCols.push(headers[COL.CLIENT]);
    if (taskData.taskTitle !== undefined && safeStr(taskData.taskTitle) !== safeStr(oldRow[COL.TASK_TITLE])) changedCols.push(headers[COL.TASK_TITLE]);
    if (taskData.description !== undefined && safeStr(taskData.description) !== safeStr(oldRow[COL.DESCRIPTION])) changedCols.push(headers[COL.DESCRIPTION]);
    if (taskData.priority !== undefined && safeStr(taskData.priority) !== safeStr(oldRow[COL.PRIORITY])) changedCols.push(headers[COL.PRIORITY]);
    if (taskData.dueDate !== undefined && safeStr(taskData.dueDate) !== safeStr(oldRow[COL.DUE_DATE] ? formatDate(oldRow[COL.DUE_DATE]) : '')) changedCols.push(headers[COL.DUE_DATE]);
    if (taskData.status !== undefined && safeStr(taskData.status) !== safeStr(oldRow[COL.STATUS])) changedCols.push(headers[COL.STATUS]);
    if (taskData.notes !== undefined && safeStr(taskData.notes) !== safeStr(oldRow[COL.NOTES])) changedCols.push(headers[COL.NOTES]);
    if (taskData.lead !== undefined && safeStr(taskData.lead) !== safeStr(oldRow[COL.LEAD])) changedCols.push(headers[COL.LEAD]);
    if (taskData.support !== undefined && safeStr(taskData.support) !== safeStr(oldRow[COL.SUPPORT])) changedCols.push(headers[COL.SUPPORT]);
    
    // Handle completed date logic
    let completedDate = taskData.completedDate || '';
    if (taskData.status === 'Completed') {
      if (!safeStr(oldRow[COL.COMPLETED_DATE])) {
        completedDate = now;
        if (!changedCols.includes(headers[COL.COMPLETED_DATE])) changedCols.push(headers[COL.COMPLETED_DATE]);
      } else {
        completedDate = oldRow[COL.COMPLETED_DATE]; // preserve old date if it existed
      }
    } else {
      completedDate = '';
    }
    
    const lastUpdatedValue = changedCols.length > 0 ? changedCols.join(', ') : 'Web App Edit';
    const assigned = formatAssigned(taskData.lead !== undefined ? taskData.lead : oldRow[COL.LEAD], 
                                    taskData.support !== undefined ? taskData.support : oldRow[COL.SUPPORT]);
    
    // Update all fields
    if (taskData.client !== undefined) sheet.getRange(rowIndex, COL.CLIENT + 1).setValue(taskData.client);
    if (taskData.taskTitle !== undefined) sheet.getRange(rowIndex, COL.TASK_TITLE + 1).setValue(taskData.taskTitle);
    if (taskData.description !== undefined) sheet.getRange(rowIndex, COL.DESCRIPTION + 1).setValue(taskData.description);
    if (taskData.priority !== undefined) sheet.getRange(rowIndex, COL.PRIORITY + 1).setValue(taskData.priority);
    if (taskData.dueDate !== undefined) sheet.getRange(rowIndex, COL.DUE_DATE + 1).setValue(taskData.dueDate);
    if (taskData.status !== undefined) sheet.getRange(rowIndex, COL.STATUS + 1).setValue(taskData.status);
    if (taskData.notes !== undefined) sheet.getRange(rowIndex, COL.NOTES + 1).setValue(taskData.notes);
    if (taskData.lead !== undefined) sheet.getRange(rowIndex, COL.LEAD + 1).setValue(taskData.lead);
    if (taskData.support !== undefined) sheet.getRange(rowIndex, COL.SUPPORT + 1).setValue(taskData.support);
    
    sheet.getRange(rowIndex, COL.COMPLETED_DATE + 1).setValue(completedDate);
    sheet.getRange(rowIndex, COL.ASSIGNED + 1).setValue(assigned);
    
    // Tracking fields
    sheet.getRange(rowIndex, COL.LAST_UPDATED + 1).setValue(lastUpdatedValue);
    sheet.getRange(rowIndex, COL.LAST_EDITED_BY + 1).setValue(userName);
    sheet.getRange(rowIndex, COL.LAST_SYNC_TIME + 1).setValue(now);
    
    return { 
      success: true, 
      message: 'Task updated successfully'
    };
  } catch (error) {
    Logger.log('Error in updateTask: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function deleteTask(taskId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][COL.TASK_ID] === taskId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Task not found' };
    }
    
    sheet.deleteRow(rowIndex);
    
    return { 
      success: true, 
      message: 'Task deleted successfully'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Support optional currentUser param from Web App
function markTaskCompleted(taskId, currentUser) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    let userName = currentUser;
    if (!userName) {
      userName = 'Master Tracker';
    }
    
    const now = new Date();
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][COL.TASK_ID] === taskId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Task not found' };
    }
    
    const headers = data[0];
    const lastUpdatedValue = `${headers[COL.STATUS]}, ${headers[COL.COMPLETED_DATE]}`;
    
    sheet.getRange(rowIndex, COL.STATUS + 1).setValue('Completed');
    sheet.getRange(rowIndex, COL.COMPLETED_DATE + 1).setValue(now);
    sheet.getRange(rowIndex, COL.LAST_UPDATED + 1).setValue(lastUpdatedValue);
    sheet.getRange(rowIndex, COL.LAST_EDITED_BY + 1).setValue(userName);
    sheet.getRange(rowIndex, COL.LAST_SYNC_TIME + 1).setValue(now);
    
    return { 
      success: true, 
      message: 'Task marked as completed'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getFilterOptions() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'Sheet not found' };
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { 
        success: true, 
        clients: [],
        priorities: ['High', 'Medium', 'Low'],
        statuses: ['Not Started', 'In Progress', 'Scheduled', 'Completed'],
        users: []
      };
    }
    
    // Convert to String to prevent Date/Undefined errors
    const clients = [...new Set(data.slice(1).map(row => row[COL.CLIENT] ? String(row[COL.CLIENT]) : '').filter(Boolean))].sort();
    const users = [...new Set(
      data.slice(1)
        .flatMap(row => [row[COL.LEAD] ? String(row[COL.LEAD]) : '', row[COL.SUPPORT] ? String(row[COL.SUPPORT]) : ''])
        .filter(Boolean)
    )].sort();
    
    return {
      success: true,
      clients: clients,
      priorities: ['High', 'Medium', 'Low'],
      statuses: ['Not Started', 'In Progress', 'Scheduled', 'Completed'],
      users: users
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ===================================
// HELPER FUNCTIONS
// ===================================

// Secure backend password storage
const USER_PASSWORDS = {
  'MASTER TRACKER': 'YOUR_PASSWORD_HERE',
  'Noelle': 'YOUR_PASSWORD_HERE',
  'Rexamy': 'YOUR_PASSWORD_HERE',
  'Mecka': 'YOUR_PASSWORD_HERE',
  'Ren': 'YOUR_PASSWORD_HERE',
  'Francis': 'YOUR_PASSWORD_HERE'
};

function verifyPassword(userName, password) {
  if (USER_PASSWORDS[userName] && USER_PASSWORDS[userName] === password) {
    return { success: true };
  }
  return { success: false, error: 'Incorrect password' };
}

function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  
  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return date.toString();
  }
}

function formatDateTime(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  try {
    // Renders the exact time (e.g. 2024-05-15 14:30:00)
    return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  } catch (e) {
    return date.toString();
  }
}

/**
 * Cleanly separates multiple names assigned to Lead and Support,
 * replaces " & " with commas, and prevents duplicates.
 */
function formatAssigned(lead, support) {
  const allNames = [];
  if (lead) allNames.push(...String(lead).split(','));
  if (support) allNames.push(...String(support).split(','));
  
  const finalNames = [];
  allNames.forEach(name => {
    // If a user typed "Noelle & Rexamy", cleanly split them
    name.split('&').forEach(n => {
        const cleanName = n.trim();
        if (cleanName) finalNames.push(cleanName);
    });
  });
  
  return [...new Set(finalNames)].join(', ');
}

// ===================================
// AUTO TASK ID GENERATION
// ===================================

function getMaxTaskId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  
  const taskIds = sheet.getRange(2, COL.TASK_ID + 1, lastRow - 1, 1).getValues();
  let max = 0;
  
  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i][0];
    if (taskId) {
      const match = taskId.toString().match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > max) max = num;
      }
    }
  }
  return max;
}

/**
 * AUTO-TRIGGER: Runs when a new row or cell is edited in the sheet directly
 */
function onEdit(e) {
  if (!e || !e.range) return;
  
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    
    const range = e.range;
    const startRow = range.getRow();
    const numRows = range.getNumRows();
    const startCol = range.getColumn();
    const numCols = range.getNumColumns();
    
    // Ignore edits happening entirely within the header row
    if (startRow <= 1 && numRows === 1) return;
    
    // Identify which columns the user just edited
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    let editedColNames = [];
    for (let c = startCol; c < startCol + numCols; c++) {
      // Exclude tracking columns to avoid noise
      if (c - 1 !== COL.LAST_UPDATED && c - 1 !== COL.LAST_SYNC_TIME && c - 1 !== COL.LAST_EDITED_BY && c - 1 !== COL.ASSIGNED) {
        if (headers[c - 1]) editedColNames.push(headers[c - 1]);
      }
    }
    const lastUpdatedVal = editedColNames.length > 0 ? editedColNames.join(', ') : 'Auto Update';
    
    // Collect rows that were modified
    let rowsToProcess = [];
    for (let i = 0; i < numRows; i++) {
      let currentRow = startRow + i;
      if (currentRow > 1) rowsToProcess.push(currentRow);
    }
    
    if (rowsToProcess.length > 0) {
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000); 
        
        let userName = 'Master Tracker';
        
        const now = new Date();
        let currentMax = getMaxTaskId(sheet);
        
        for (let row of rowsToProcess) {
          let taskIdCell = sheet.getRange(row, COL.TASK_ID + 1);
          let currentTaskId = taskIdCell.getValue();
          
          let rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
          let rowHasData = rowData.some((cell, idx) => idx !== COL.TASK_ID && cell !== '');
          
          let acted = false;

          // If no Task ID exists but data is typed, generate ID
          if (!currentTaskId && rowHasData) {
            currentMax++; 
            taskIdCell.setValue(TASK_ID_PREFIX + String(currentMax).padStart(3, '0'));
            sheet.getRange(row, COL.LAST_UPDATED + 1).setValue("New Task");
            acted = true;
          } 
          // If Task ID exists and data is typed, update tracking columns
          else if (currentTaskId && editedColNames.length > 0) {
            sheet.getRange(row, COL.LAST_UPDATED + 1).setValue(lastUpdatedVal);
            acted = true;
          }
          
          // Ensure tracking columns run if any valid action was taken
          if (acted) {
            sheet.getRange(row, COL.LAST_SYNC_TIME + 1).setValue(now);
            sheet.getRange(row, COL.LAST_EDITED_BY + 1).setValue(userName);
            
            const lead = sheet.getRange(row, COL.LEAD + 1).getValue();
            const support = sheet.getRange(row, COL.SUPPORT + 1).getValue();
            const assigned = formatAssigned(lead, support);
            sheet.getRange(row, COL.ASSIGNED + 1).setValue(assigned);
          }
        }
      } catch (lockError) {
        Logger.log('Could not obtain lock: ' + lockError);
      } finally {
        lock.releaseLock();
      }
    }
  } catch (error) {
    Logger.log('Error in onEdit: ' + error.toString());
  }
}

function generateMissingTaskIds() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      Logger.log('Sheet not found: ' + SHEET_NAME);
      return;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 14));
    const data = dataRange.getValues();
    const now = new Date();
    let updatedCount = 0;
    
    let currentMax = getMaxTaskId(sheet);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const taskId = row[COL.TASK_ID];
      
      if (!taskId) {
        const hasData = row.some((cell, index) => index !== COL.TASK_ID && cell !== '');
        if (hasData) {
          currentMax++;
          const newTaskId = TASK_ID_PREFIX + String(currentMax).padStart(3, '0');
          const rowIndex = i + 2; 
          
          sheet.getRange(rowIndex, COL.TASK_ID + 1).setValue(newTaskId);
          sheet.getRange(rowIndex, COL.LAST_UPDATED + 1).setValue("Auto-Generated ID");
          sheet.getRange(rowIndex, COL.LAST_SYNC_TIME + 1).setValue(now);
          
          const lead = row[COL.LEAD] || '';
          const support = row[COL.SUPPORT] || '';
          const assigned = formatAssigned(lead, support);
          sheet.getRange(rowIndex, COL.ASSIGNED + 1).setValue(assigned);
          
          updatedCount++;
        }
      }
    }
    
    Logger.log('Done! Generated ' + updatedCount + ' Task IDs');
    return updatedCount;
  } catch (error) {
    Logger.log('Error generating bulk IDs: ' + error.toString());
  } finally {
    lock.releaseLock();
  }
}

function fixScrambledTaskIds() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return;
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 1));
    const data = dataRange.getValues();
    
    let currentNum = 1;
    for (let i = 0; i < data.length; i++) {
      const hasData = data[i].some((cell, index) => index !== COL.TASK_ID && cell !== '');
      if (hasData || data[i][COL.TASK_ID]) {
        const newTaskId = TASK_ID_PREFIX + String(currentNum).padStart(3, '0');
        sheet.getRange(i + 2, COL.TASK_ID + 1).setValue(newTaskId);
        currentNum++;
      }
    }
    Logger.log('Finished re-numbering all rows cleanly!');
  } catch (error) {
    Logger.log('Error fixing IDs: ' + error.toString());
  } finally {
    lock.releaseLock();
  }
}

// ===================================
// REST API FOR NETLIFY
// ===================================
function doPost(e) {
  let output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    let result = {};

    if (action === 'getTasks') {
      result = getTasks(params.userName);
    } else if (action === 'getFilterOptions') {
      result = getFilterOptions();
    } else if (action === 'addTask') {
      result = addTask(params.taskData);
    } else if (action === 'updateTask') {
      result = updateTask(params.taskData);
    } else if (action === 'deleteTask') {
      result = deleteTask(params.taskId);
    } else if (action === 'markTaskCompleted') {
      result = markTaskCompleted(params.taskId, params.currentUser);
    } else if (action === 'verifyPassword') {
      result = verifyPassword(params.userName, params.password);
    } else {
      result = { success: false, error: 'Unknown API action' };
    }

    output.setContent(JSON.stringify(result));
  } catch (err) {
    output.setContent(JSON.stringify({ success: false, error: err.toString() }));
  }
  
  return output;
}
