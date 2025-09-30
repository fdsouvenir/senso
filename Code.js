/**
 * @OnlyCurrentDoc
 * 
 * Main orchestration script for the ETL pipeline.
 * This final version includes programmatic trigger creation to ensure
 * the automation runs as the end-user who authorizes the script.
 */

// --- CONFIGURATION ---
const GCP_PROJECT_ID = 'senso-473622'; 
const DRIVE_FOLDER_ID = '1MPXgywD-TvvsB1bFVDQ3CocujcF8ucia'; // Correct ID is hardcoded.
const RETRY_INTERVAL_MINUTES = 0.5;
const TIME_BUFFER_MINUTES = 2; 
// --------------------

const EXECUTION_TIME_LIMIT_MINUTES = 6; 

/**
 * Adds a custom menu to the spreadsheet when it's opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // Main menu
  const mainMenu = ui.createMenu('Restaurant Analytics');

  // Backend operations
  mainMenu.addItem('🔐 Configure Secure Credentials', 'SecureConfig.initialize')
    .addItem('ONE-TIME SETUP: Authorize & Activate', 'runInitialSetup')
    .addSeparator()
    .addItem('Run Full Data Ingestion (Manual)', 'startFullIngestion')
    .addItem('Show Status Dashboard', 'showDashboard')
    .addItem('Check Credential Status', 'checkCredentialStatus')
    .addSeparator();

  // Frontend operations submenu
  const frontendMenu = ui.createMenu('📊 Reports & Analytics');
  frontendMenu.addItem('Setup Frontend Tables', 'setupFrontendTables')
    .addItem('Configure Report Settings', 'configureFrontendSettings')
    .addSeparator()
    .addItem('Send Test Daily Report', 'sendTestDailyReport')
    .addItem('Send Test Weekly Report', 'sendTestWeeklyReport')
    .addItem('Test Chart Generation', 'testChartGeneration')
    .addSeparator()
    .addItem('🌐 Configure Web App', 'configureWebApp')
    .addSeparator()
    .addItem('📧 Test Gmail API Connection', 'testGmailApiConnection')
    .addItem('📧 Send Gmail API Test Email', 'sendGmailApiTestEmail');

  // Trigger management submenu
  const triggerMenu = ui.createMenu('⏰ Automated Triggers');
  triggerMenu.addItem('📅 Set Up Daily Reports (Tue-Sun @ 8AM)', 'TriggerManager.setupDailyReportTrigger')
    .addItem('📈 Set Up Weekly Reports (Mon @ 8AM)', 'TriggerManager.setupWeeklyReportTrigger')
    .addItem('🚀 Set Up All Report Triggers', 'TriggerManager.setupAllReportTriggers')
    .addSeparator()
    .addItem('🔍 View Trigger Status', 'TriggerManager.viewTriggerStatus')
    .addItem('🧪 Test Configuration', 'TriggerManager.testTriggerConfiguration')
    .addSeparator()
    .addItem('❌ Remove All Report Triggers', 'TriggerManager.removeAllReportTriggers');

  mainMenu.addSubMenu(frontendMenu)
    .addSubMenu(triggerMenu)
    .addSeparator()
    .addItem('About', 'showAbout')
    .addToUi();
}

/**
 * Check if credentials are configured
 */
function checkCredentialStatus() {
  const ui = SpreadsheetApp.getUi();
  const status = SecureConfig.checkConfiguration();

  let message = 'Credential Status:\n\n';
  message += `✅ GCP Private Key: ${status.gcpPrivateKey ? 'Configured' : '❌ Not configured'}\n`;
  message += `✅ GCP Service Account: ${status.gcpServiceAccount ? 'Configured' : '❌ Not configured'}\n`;
  message += `✅ Gemini API Key: ${status.geminiApiKey ? 'Configured' : '❌ Not configured'}\n\n`;

  if (!status.gcpPrivateKey || !status.geminiApiKey) {
    message += 'Please run "Configure Secure Credentials" from the menu.';
  } else {
    message += 'All credentials are properly configured!';
  }

  ui.alert('Credential Configuration Status', message, ui.ButtonSet.OK);
}

/**
 * A one-time setup function for new users to authorize the script AND create the automated triggers.
 * When a user runs this, they become the owner of the triggers.
 */
function runInitialSetup() {
  Logger.log('Running initial setup to trigger authorization...');
  
  try {
    // 1. Touch protected services to trigger the OAuth consent screen.
    GmailApp.getUserLabels();
    DriveApp.getRootFolder();
    BigQuery.Jobs.list(GCP_PROJECT_ID);
    
    // 2. If authorization is successful, proceed to create the triggers.
    Logger.log('Permissions granted. Now creating automated triggers...');
    
    // Delete any old triggers to prevent duplicates.
    deleteTriggersForCurrentUser();
    
    // Create the trigger for the Gmail Harvester.
    ScriptApp.newTrigger('harvestNewPdfsFromGmail')
      .timeBased()
      .everyMinutes(15)
      .create();
    Logger.log('Created 15-minute trigger for Gmail Harvester.');
      
    // Create the trigger for the daily log cleanup.
    ScriptApp.newTrigger('cleanOldMessageIds')
      .timeBased()
      .everyDays(1)
      .atHour(1) // Run between 1am and 2am
      .create();
    Logger.log('Created daily trigger for log cleanup.');

    // 3. Show a final success message.
    SpreadsheetApp.getUi().alert('Success! The script has been authorized and your automated triggers have been activated. New reports will now be processed automatically.');
    
  } catch (e) {
    Logger.log(`Authorization may have been denied or failed. Error: ${e.message}`);
    SpreadsheetApp.getUi().alert(`An error occurred. If you denied a permission, please run the setup again and grant all requested permissions for the script to function. Error: ${e.message}`);
  }
}


/**
 * Kicks off a fresh ingestion process by running the first batch directly.
 * This is for manual runs and does not affect the automated triggers.
 */
function startFullIngestion() {
  Logger.log('startFullIngestion: Starting...');
  
  // This manual run should not affect the user's automated triggers.
  // It only deletes its own continuation triggers.
  deleteContinuationTriggers(); 
  PropertiesService.getUserProperties().deleteAllProperties();
  
  const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('ingestionStatus', 'Starting...');
  userProperties.setProperty('processedCount', '0');
  userProperties.setProperty('lastRunTimestamp', new Date().toUTCString());
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Starting data ingestion. This may take a few minutes. See Status Dashboard for progress.', 'Process Started', 10);
  
  processPdfBatch();
}


/**
 * Processes a batch of PDFs from Google Drive.
 */
function processPdfBatch() {
  const startTime = new Date();
  const userProperties = PropertiesService.getUserProperties();
  
  userProperties.setProperty('ingestionStatus', 'Running...');
  userProperties.setProperty('lastRunTimestamp', new Date().toUTCString());
  let processedCount = parseInt(userProperties.getProperty('processedCount') || '0');

  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const continuationToken = userProperties.getProperty('continuationToken');
    
    let files;
    if (continuationToken) {
      files = DriveApp.continueFileIterator(continuationToken);
    } else {
      files = folder.getFilesByType(MimeType.PDF);
    }

    if (!files.hasNext() && !continuationToken) {
      Logger.log('No PDF files found in the specified folder.');
      userProperties.setProperty('ingestionStatus', 'Completed (No files found)');
      return;
    }

    while (files.hasNext()) {
      const timeElapsed = (new Date().getTime() - startTime.getTime()) / 1000 / 60;
      if (timeElapsed > (EXECUTION_TIME_LIMIT_MINUTES - TIME_BUFFER_MINUTES)) {
        userProperties.setProperty('continuationToken', files.getContinuationToken());
        deleteContinuationTriggers();
        ScriptApp.newTrigger('processPdfBatch').timeBased().after(RETRY_INTERVAL_MINUTES * 60 * 1000).create();
        
        userProperties.setProperty('ingestionStatus', `Waiting... (Safety stop, will continue in ${RETRY_INTERVAL_MINUTES} mins)`);
        Logger.log(`Safety stop enacted. Script will continue in ${RETRY_INTERVAL_MINUTES} minutes.`);
        return;
      }

      const file = files.next();
      
      const isProcessed = userProperties.getProperty(file.getId());
      if (isProcessed) continue;

      try {
        Logger.log(`Processing file: ${file.getName()}`);
        
        if (file.getName().startsWith('pmix-')) {
          const parsedData = PmixParser.parse(file);
          if (parsedData) {
            BigQueryLoader.loadData(parsedData, GCP_PROJECT_ID);
            userProperties.setProperty(file.getId(), 'true');
            processedCount++;
            userProperties.setProperty('processedCount', processedCount);
          } else {
            userProperties.setProperty(file.getId(), 'failed_to_parse');
          }
        }
      } catch (e) {
        Logger.log(`Error on file ${file.getName()}: ${e.toString()}`);
        if (e.message.includes("timed out")) {
          Logger.log(`Skipping file ${file.getName()} due to API timeout.`);
          userProperties.setProperty(file.getId(), 'timed_out');
        } else {
          userProperties.setProperty('ingestionStatus', `Error on file: ${file.getName()}`);
        }
      }
    }

    Logger.log('All files processed successfully.');
    userProperties.setProperty('ingestionStatus', 'Completed');
    userProperties.deleteProperty('continuationToken');
    deleteContinuationTriggers();

  } catch (e) {
    userProperties.setProperty('ingestionStatus', `Failed: ${e.message}`);
    if (e.message.includes('We\'re sorry, a server error occurred')) {
      Logger.log(`Transient error during script setup: ${e.message}. Rescheduling job to try again in ${RETRY_INTERVAL_MINUTES} minutes.`);
      deleteContinuationTriggers();
      ScriptApp.newTrigger('processPdfBatch').timeBased().after(RETRY_INTERVAL_MINUTES * 60 * 1000).create();
    } else {
      Logger.log(`Critical non-recoverable error in processPdfBatch: ${e.message}`);
      deleteContinuationTriggers();
    }
  }
}

/**
 * Deletes ONLY the continuation triggers for the batch processing function.
 */
function deleteContinuationTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'processPdfBatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

/**
 * Deletes ALL recurring triggers for the current user.
 * This is used in the setup to ensure a clean slate before creating new triggers.
 */
function deleteTriggersForCurrentUser() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    const funcName = trigger.getHandlerFunction();
    if (funcName === 'harvestNewPdfsFromGmail' || funcName === 'cleanOldMessageIds') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

// ========== FRONTEND FUNCTIONS ==========

/**
 * Set up frontend BigQuery tables
 */
function setupFrontendTables() {
  try {
    SchemaSetup.runSetup();
  } catch (error) {
    ErrorHandler.handleError(error, 'setupFrontendTables', {}, true);
    SpreadsheetApp.getUi().alert('Error', 'Failed to setup frontend tables. Check logs for details.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Configure frontend report settings
 */
function configureFrontendSettings() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Configure Report Settings',
    'This will open a configuration dialog for report settings.\n\n' +
    'Current settings:\n' +
    `- Daily Reports: ${Config.REPORTS.daily.enabled ? 'Enabled' : 'Disabled'}\n` +
    `- Weekly Reports: ${Config.REPORTS.weekly.enabled ? 'Enabled' : 'Disabled'}\n` +
    `- Report Time: ${Config.REPORTS.daily.time}\n` +
    `- Timezone: ${Config.REPORTS.daily.timezone}\n\n` +
    'Would you like to continue?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    // Store settings in Script Properties
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('FRONTEND_CONFIGURED', 'true');

    ui.alert('Success', 'Frontend configuration has been saved.', ui.ButtonSet.OK);
  }
}

/**
 * Send a test daily report
 */
function sendTestDailyReport() {
  try {
    const ui = SpreadsheetApp.getUi();

    // Ask user which date to generate report for
    const response = ui.prompt(
      'Generate Daily Report',
      'Enter date for report (YYYY-MM-DD) or leave blank for yesterday:',
      ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() !== ui.Button.OK) {
      return;
    }

    let reportDate;
    if (response.getResponseText()) {
      reportDate = new Date(response.getResponseText());
      if (isNaN(reportDate.getTime())) {
        ui.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format.', ui.ButtonSet.OK);
        return;
      }
    } else {
      // Default to yesterday
      reportDate = new Date();
      reportDate.setDate(reportDate.getDate() - 1);
    }

    ui.alert('Generating Report', `Generating daily report for ${Config.formatDate(reportDate)}. This may take a moment...`, ui.ButtonSet.OK);

    // Generate report with real data
    const reportData = DailyReport.generate(reportDate);

    // Send the report
    const success = EmailService.sendDailyReport(reportData);

    if (success) {
      ui.alert('Success', `Daily report for ${Config.formatDate(reportDate)} has been sent to your email.`, ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'Failed to send report. Check logs for details.', ui.ButtonSet.OK);
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'sendTestDailyReport', {}, true);
    SpreadsheetApp.getUi().alert('Error', `Failed to generate report: ${error.toString()}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Send a test weekly report
 */
function sendTestWeeklyReport() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Sending Test Report', 'A test weekly report will be sent to your email address.', ui.ButtonSet.OK);

    // TODO: Implement actual weekly report generation
    ui.alert('Coming Soon', 'Weekly report functionality will be implemented in the next phase.', ui.ButtonSet.OK);
  } catch (error) {
    ErrorHandler.handleError(error, 'sendTestWeeklyReport', {}, true);
  }
}

/**
 * Test chart generation
 */
function testChartGeneration() {
  try {
    const ui = SpreadsheetApp.getUi();

    // Test basic chart generation
    const testUrl = ChartGenerator.generateTestChart();

    // Test with actual data
    const sampleData = [1000, 1200, 1100, 1300, 1250, 1400, 1350];
    const sampleLabels = ['9/21', '9/22', '9/23', '9/24', '9/25', '9/26', '9/27'];

    const actualUrl = ChartGenerator.generateLineChart(
      sampleData,
      'Sample Sales Trend',
      600, 300,
      null,
      sampleLabels
    );

    // Show URLs to user
    const message = `Chart URLs Generated:\n\n` +
      `Test Chart:\n${testUrl}\n\n` +
      `Sample Chart:\n${actualUrl}\n\n` +
      `Copy and paste these URLs into a browser to test if they work.`;

    ui.alert('Chart Test', message, ui.ButtonSet.OK);

    // Also log for debugging
    Logger.log('Test chart URL: ' + testUrl);
    Logger.log('Sample chart URL: ' + actualUrl);

  } catch (error) {
    ErrorHandler.handleError(error, 'testChartGeneration', {}, true);
    SpreadsheetApp.getUi().alert('Error', `Chart generation failed: ${error.toString()}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Enable daily reports
 */
function enableDailyReports() {
  try {
    // Delete existing daily report triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'generateDailyReport') {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    // Create new daily trigger
    ScriptApp.newTrigger('generateDailyReport')
      .timeBased()
      .everyDays(1)
      .atHour(8) // 8 AM
      .create();

    const ui = SpreadsheetApp.getUi();
    ui.alert('Success', 'Daily reports have been enabled. Reports will be sent at 8 AM daily.', ui.ButtonSet.OK);
  } catch (error) {
    ErrorHandler.handleError(error, 'enableDailyReports', {}, true);
  }
}

/**
 * Enable weekly reports
 */
function enableWeeklyReports() {
  try {
    // Delete existing weekly report triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'generateWeeklyReport') {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    // Create new weekly trigger
    ScriptApp.newTrigger('generateWeeklyReport')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(8) // 8 AM Monday
      .create();

    const ui = SpreadsheetApp.getUi();
    ui.alert('Success', 'Weekly reports have been enabled. Reports will be sent at 8 AM every Monday.', ui.ButtonSet.OK);
  } catch (error) {
    ErrorHandler.handleError(error, 'enableWeeklyReports', {}, true);
  }
}

/**
 * Disable all reports
 */
function disableAllReports() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let count = 0;

    triggers.forEach(trigger => {
      const func = trigger.getHandlerFunction();
      if (func === 'generateDailyReport' || func === 'generateWeeklyReport') {
        ScriptApp.deleteTrigger(trigger);
        count++;
      }
    });

    const ui = SpreadsheetApp.getUi();
    ui.alert('Success', `All report triggers have been disabled. Removed ${count} trigger(s).`, ui.ButtonSet.OK);
  } catch (error) {
    ErrorHandler.handleError(error, 'disableAllReports', {}, true);
  }
}

/**
 * View current report schedule
 */
function viewReportSchedule() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const reportTriggers = triggers.filter(t =>
      t.getHandlerFunction() === 'generateDailyReport' ||
      t.getHandlerFunction() === 'generateWeeklyReport'
    );

    let message = 'Current Report Schedule:\n\n';

    if (reportTriggers.length === 0) {
      message += 'No report triggers are currently active.';
    } else {
      reportTriggers.forEach(trigger => {
        const func = trigger.getHandlerFunction();
        const type = trigger.getTriggerSource();
        message += `• ${func}: ${type}\n`;
      });
    }

    const ui = SpreadsheetApp.getUi();
    ui.alert('Report Schedule', message, ui.ButtonSet.OK);
  } catch (error) {
    ErrorHandler.handleError(error, 'viewReportSchedule', {}, true);
  }
}

/**
 * Show about information
 */
function showAbout() {
  const ui = SpreadsheetApp.getUi();
  const message =
    'Senso Restaurant Analytics v2.0\n\n' +
    'An automated ETL pipeline for restaurant data analytics with AI-powered insights.\n\n' +
    'Components:\n' +
    '• Automated PDF extraction from Gmail\n' +
    '• AI-powered data parsing with Gemini\n' +
    '• BigQuery data warehousing\n' +
    '• Daily & weekly email reports\n' +
    '• Natural language Q&A via email\n' +
    '• Predictive analytics & forecasting\n\n' +
    '© 2024 Senso Analytics';

  ui.alert('About Senso Analytics', message, ui.ButtonSet.OK);
}

/**
 * Automated daily report generation (triggered by schedule)
 */
function generateDailyReport() {
  try {
    ErrorHandler.info('DailyReport', 'Starting automated daily report generation');

    // Check if it's a day we should send reports
    const today = new Date();
    const dayName = Utilities.formatDate(today, Config.REPORTS.daily.timezone, 'EEEE');

    if (!Config.REPORTS.daily.daysActive.includes(dayName)) {
      ErrorHandler.info('DailyReport', `Skipping report for ${dayName} (not in active days)`);
      return;
    }

    // Generate report for yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const reportData = DailyReport.generate(yesterday);

    // Send the report
    const success = EmailService.sendDailyReport(reportData);

    if (success) {
      ErrorHandler.info('DailyReport', `Daily report sent successfully for ${Config.formatDate(yesterday)}`);
    } else {
      ErrorHandler.error('DailyReport', 'Failed to send daily report');
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'generateDailyReport', {}, true);
  }
}

/**
 * Automated weekly report generation (triggered by schedule)
 */
function generateWeeklyReport() {
  try {
    ErrorHandler.info('WeeklyReport', 'Starting automated weekly report generation');

    const reportData = WeeklyReport.generate();
    const success = EmailService.sendWeeklyReport(reportData);

    if (success) {
      ErrorHandler.info('WeeklyReport', 'Weekly report sent successfully');
    } else {
      ErrorHandler.error('WeeklyReport', 'Failed to send weekly report');
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'generateWeeklyReport', {}, true);
  }
}

/**
 * Test function to send a daily report (menu item)
 */
function sendTestDailyReport() {
  const ui = SpreadsheetApp.getUi();

  try {
    ui.alert('📊 Generating Test Daily Report',
      'Generating daily report for yesterday...\n\n' +
      'This may take a moment.',
      ui.ButtonSet.OK);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const reportData = DailyReport.generate(yesterday);
    const success = EmailService.sendDailyReport(reportData);

    if (success) {
      ui.alert('✅ Daily Report Sent',
        `Test daily report for ${Config.formatDate(yesterday)} has been sent to:\n\n` +
        `${Config.EMAIL.defaultRecipient || Session.getActiveUser().getEmail()}`,
        ui.ButtonSet.OK);
    } else {
      throw new Error('Failed to send email');
    }
  } catch (error) {
    ui.alert('❌ Report Failed',
      'Failed to generate daily report:\n\n' + error.toString(),
      ui.ButtonSet.OK);
    ErrorHandler.handleError(error, 'sendTestDailyReport');
  }
}

/**
 * Test function to send a weekly report (menu item)
 */
function sendTestWeeklyReport() {
  const ui = SpreadsheetApp.getUi();

  try {
    ui.alert('📈 Generating Test Weekly Report',
      'Generating weekly report for last week...\n\n' +
      'This may take a moment.',
      ui.ButtonSet.OK);

    const reportData = WeeklyReport.generate();
    const success = EmailService.sendWeeklyReport(reportData);

    if (success) {
      ui.alert('✅ Weekly Report Sent',
        `Test weekly report has been sent to:\n\n` +
        `${Config.EMAIL.defaultRecipient || Session.getActiveUser().getEmail()}`,
        ui.ButtonSet.OK);
    } else {
      throw new Error('Failed to send email');
    }
  } catch (error) {
    ui.alert('❌ Report Failed',
      'Failed to generate weekly report:\n\n' + error.toString(),
      ui.ButtonSet.OK);
    ErrorHandler.handleError(error, 'sendTestWeeklyReport');
  }
}

/**
 * Test chart generation (menu item)
 */
function testChartGeneration() {
  const ui = SpreadsheetApp.getUi();

  try {
    // Generate a test chart
    const testData = [100, 150, 125, 175, 200];
    const testLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    const chartUrl = ChartGenerator.generateLineChart(
      testData,
      'Test Sales Chart',
      600, 300,
      null,
      testLabels
    );

    // Create a simple HTML dialog to display the chart
    const html = HtmlService.createHtmlOutput(`
      <div style="text-align: center; padding: 20px;">
        <h3>Test Chart Generated</h3>
        <img src="${chartUrl}" style="max-width: 100%; border: 1px solid #ddd; margin: 10px 0;">
        <p>Chart URL has been logged to console.</p>
        <p style="word-break: break-all; font-size: 10px; color: #666;">
          ${chartUrl.substring(0, 100)}...
        </p>
      </div>
    `)
      .setWidth(650)
      .setHeight(450);

    ui.showModalDialog(html, 'Chart Test');

    Logger.log('Test chart URL: ' + chartUrl);
  } catch (error) {
    ui.alert('❌ Chart Generation Failed',
      'Error: ' + error.toString(),
      ui.ButtonSet.OK);
  }
}

/**
 * Setup frontend tables in BigQuery (menu item)
 */
function setupFrontendTables() {
  const ui = SpreadsheetApp.getUi();

  try {
    ui.alert('📋 Setting Up Frontend Tables',
      'Creating BigQuery tables for frontend analytics...',
      ui.ButtonSet.OK);

    SchemaSetup.setupFrontendTables();

    ui.alert('✅ Tables Created',
      'Frontend analytics tables have been set up in BigQuery.',
      ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('❌ Setup Failed',
      'Error: ' + error.toString(),
      ui.ButtonSet.OK);
  }
}

/**
 * Configure frontend report settings (menu item)
 */
function configureFrontendSettings() {
  const ui = SpreadsheetApp.getUi();

  // Get current recipient
  const currentRecipient = Config.EMAIL.defaultRecipient || Session.getActiveUser().getEmail();

  const result = ui.prompt(
    '📧 Configure Report Recipient',
    `Current recipient: ${currentRecipient}\n\n` +
    'Enter email address for reports:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    const email = result.getResponseText();

    if (email && email.includes('@')) {
      // Store in Script Properties
      PropertiesService.getScriptProperties().setProperty('REPORT_RECIPIENT', email);

      ui.alert('✅ Recipient Updated',
        `Reports will be sent to: ${email}`,
        ui.ButtonSet.OK);
    } else {
      ui.alert('❌ Invalid Email',
        'Please enter a valid email address.',
        ui.ButtonSet.OK);
    }
  }
}

/**
 * Configure Web App deployment settings
 */
function configureWebApp() {
  const ui = SpreadsheetApp.getUi();

  const html = `
    <div style="padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>🌐 Configure Web App for Q&A Form</h2>
      <p><strong>Current Web App URL:</strong></p>
      <p style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
        ${Config.WEB_APP.url}
      </p>

      <h3>⚠️ Required Setup Steps:</h3>
      <ol>
        <li><strong>Deploy as Web App:</strong>
          <ul>
            <li>Click "Deploy" → "Manage deployments" in the Google Apps Script editor</li>
            <li>Click "Edit" on the deployment</li>
          </ul>
        </li>
        <li><strong>Configure Settings:</strong>
          <ul>
            <li><strong>Execute as:</strong> Me (your email)</li>
            <li><strong>Who has access:</strong> Anyone</li>
          </ul>
        </li>
        <li><strong>Update & Save:</strong>
          <ul>
            <li>Click "Deploy" button</li>
            <li>Copy the new Web App URL if it changes</li>
          </ul>
        </li>
      </ol>

      <h3>📝 Test the Form:</h3>
      <p>After configuration, you can test the form by:</p>
      <ul>
        <li>Sending a test weekly report and clicking the question form</li>
        <li>Or visiting the URL directly</li>
      </ul>

      <p style="background: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin-top: 20px;">
        <strong>Note:</strong> If you see a "Page Not Found" error, the web app needs to be reconfigured with proper permissions.
      </p>
    </div>
  `;

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(600)
    .setHeight(500);

  ui.showModalDialog(htmlOutput, 'Web App Configuration');
}

/**
 * Web App Handler - Process GET requests
 * @param {Object} e Event object with query parameters
 * @returns {HtmlOutput} HTML response
 */
function doGet(e) {
  try {
    // Simple landing page for the web app
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Senso Analytics Q&A</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #1e3a5f; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type="text"], input[type="email"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    button { background: #4285F4; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #3574e2; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Senso Analytics Q&A</h1>
    <p>Ask questions about your restaurant data and receive custom reports via email.</p>

    <form method="POST" action="${ScriptApp.getService().getUrl()}">
      <div class="form-group">
        <label for="email">Email Address:</label>
        <input type="email" id="email" name="email" required placeholder="your@email.com">
      </div>

      <div class="form-group">
        <label for="question">Your Question:</label>
        <input type="text" id="question" name="question" required placeholder="e.g., Show me wine sales from last week">
      </div>

      <button type="submit">Get Report</button>
    </form>
  </div>
</body>
</html>
    `;

    return HtmlService.createHtmlOutput(html)
      .setTitle('Senso Analytics Q&A')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    ErrorHandler.handleError(error, 'doGet', { params: e });
    return HtmlService.createHtmlOutput('An error occurred. Please try again later.');
  }
}

/**
 * Web App Handler - Process POST requests (form submissions)
 * @param {Object} e Event object with form data
 * @returns {HtmlOutput|TextOutput} HTML response or JSON for AMP
 */
function doPost(e) {
  try {
    // Check if this is an AMP request
    const isAmpRequest = e.parameter.amp === 'true';

    // Extract form parameters
    const email = e.parameter.email;
    const question = e.parameter.question;
    const source = e.parameter.source || 'web_form';

    // Validate inputs
    if (!email || !question) {
      if (isAmpRequest) {
        return createAmpErrorResponse('Email and question are required', e);
      }
      throw new Error('Email and question are required');
    }

    // Process the query
    const response = QueryHandler.processQuery(question, email);

    // Log the request
    ErrorHandler.info('WebApp', `Query processed from ${source}: "${question.substring(0, 50)}..." for ${email}`);

    // Handle AMP requests with JSON response
    if (isAmpRequest) {
      return createAmpSuccessResponse({
        question: question,
        email: email,
        message: 'Your report is being generated and will be sent to your email.'
      }, e);
    }

    // Return success page for regular forms
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Report Sent - Senso Analytics</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #16a34a; }
    .message { background: #f0f9ff; border-left: 4px solid #0891b2; padding: 15px; margin: 20px 0; }
    a { color: #4285F4; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Report Sent Successfully</h1>
    <div class="message">
      <p>Your custom report has been sent to <strong>${email}</strong></p>
      <p>Question: "${question}"</p>
    </div>
    <p>Check your email for the detailed report. It may take a few moments to arrive.</p>
    <p><a href="${ScriptApp.getService().getUrl()}">Ask another question</a></p>
  </div>
</body>
</html>
    `;

    return HtmlService.createHtmlOutput(html)
      .setTitle('Report Sent - Senso Analytics')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    ErrorHandler.handleError(error, 'doPost', { email: e.parameter.email, question: e.parameter.question });

    // Return error page
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Error - Senso Analytics</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #dc2626; }
    .error { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    a { color: #4285F4; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Unable to Process Request</h1>
    <div class="error">
      <p>We encountered an error processing your request.</p>
      <p>Error: ${error.toString()}</p>
    </div>
    <p>Please try again or contact support if the issue persists.</p>
    <p><a href="${ScriptApp.getService().getUrl()}">Try again</a></p>
  </div>
</body>
</html>
    `;

    return HtmlService.createHtmlOutput(html)
      .setTitle('Error - Senso Analytics')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Create AMP success response with proper CORS headers
 * @param {Object} data Response data
 * @param {Object} e Event object with AMP headers
 * @returns {TextOutput} JSON response with CORS headers
 */
function createAmpSuccessResponse(data, e) {
  const response = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);

  // Set AMP CORS headers
  response.addHeader('Access-Control-Allow-Origin', 'https://mail.google.com');
  response.addHeader('Access-Control-Allow-Credentials', 'true');
  response.addHeader('Access-Control-Expose-Headers', 'AMP-Access-Control-Allow-Source-Origin');
  response.addHeader('AMP-Access-Control-Allow-Source-Origin', e.parameter.__amp_source_origin || 'https://mail.google.com');

  return response;
}

/**
 * Create AMP error response with proper CORS headers
 * @param {string} errorMessage Error message
 * @param {Object} e Event object with AMP headers
 * @returns {TextOutput} JSON error response with CORS headers
 */
function createAmpErrorResponse(errorMessage, e) {
  const response = ContentService
    .createTextOutput(JSON.stringify({
      error: true,
      message: errorMessage
    }))
    .setMimeType(ContentService.MimeType.JSON);

  // Set AMP CORS headers
  response.addHeader('Access-Control-Allow-Origin', 'https://mail.google.com');
  response.addHeader('Access-Control-Allow-Credentials', 'true');
  response.addHeader('Access-Control-Expose-Headers', 'AMP-Access-Control-Allow-Source-Origin');
  response.addHeader('AMP-Access-Control-Allow-Source-Origin', e.parameter.__amp_source_origin || 'https://mail.google.com');

  // Set error status code
  response.addHeader('HTTP/1.1 400 Bad Request');

  return response;
}

/**
 * Handle CORS preflight requests for AMP
 * @param {Object} e Event object
 * @returns {TextOutput} Empty response with CORS headers
 */
function doOptions(e) {
  const response = ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);

  // Set CORS headers for preflight
  response.addHeader('Access-Control-Allow-Origin', 'https://mail.google.com');
  response.addHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.addHeader('Access-Control-Allow-Headers', 'Content-Type, AMP-Same-Origin');
  response.addHeader('Access-Control-Allow-Credentials', 'true');

  return response;
}