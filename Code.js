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
  mainMenu.addItem('ONE-TIME SETUP: Authorize & Activate', 'runInitialSetup')
    .addSeparator()
    .addItem('Run Full Data Ingestion (Manual)', 'startFullIngestion')
    .addItem('Show Status Dashboard', 'showDashboard')
    .addSeparator();

  // Frontend operations submenu
  const frontendMenu = ui.createMenu('📊 Reports & Analytics');
  frontendMenu.addItem('Setup Frontend Tables', 'setupFrontendTables')
    .addItem('Configure Report Settings', 'configureFrontendSettings')
    .addSeparator()
    .addItem('Send Test Daily Report', 'sendTestDailyReport')
    .addItem('Send Test Weekly Report', 'sendTestWeeklyReport')
    .addSeparator()
    .addItem('Enable Daily Reports', 'enableDailyReports')
    .addItem('Enable Weekly Reports', 'enableWeeklyReports')
    .addItem('Disable All Reports', 'disableAllReports')
    .addSeparator()
    .addItem('View Report Schedule', 'viewReportSchedule');

  mainMenu.addSubMenu(frontendMenu)
    .addSeparator()
    .addItem('About', 'showAbout')
    .addToUi();
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
    ui.alert('Sending Test Report', 'A test daily report will be sent to your email address.', ui.ButtonSet.OK);

    // TODO: Implement actual daily report generation
    // For now, send a sample report
    const testData = {
      date: Config.formatDate(new Date()),
      displayDate: Utilities.formatDate(new Date(), Config.REPORTS.daily.timezone, 'EEEE, MMMM d, yyyy'),
      dayName: Utilities.formatDate(new Date(), Config.REPORTS.daily.timezone, 'EEEE'),
      totalSales: 5432.10,
      percentChange: 12.5,
      contextNote: 'This is a test report with sample data',
      categories: [
        {
          name: 'Signature Rolls',
          items: [
            { name: 'Rainbow Roll', sales: 420, quantity: 12 },
            { name: 'Dragon Roll', sales: 380, quantity: 10 },
            { name: 'Spider Roll', sales: 340, quantity: 9 }
          ]
        },
        {
          name: 'Wine',
          items: [
            { name: 'Pinot Grigio', sales: 180, quantity: 6 },
            { name: 'Chardonnay', sales: 150, quantity: 5 },
            { name: 'Merlot', sales: 120, quantity: 4 }
          ]
        }
      ],
      trendChartUrl: ChartGenerator.generateLineChart(
        [100, 110, 125, 115, 130, 125, 140],
        'Sales Trend',
        600, 300,
        null,
        ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Today']
      ),
      prediction: {
        id: 'TEST-001',
        amount: 5890,
        reasoning: 'Based on recent trends and typical weekend patterns',
        confidence: 8
      }
    };

    const success = EmailService.sendDailyReport(testData);

    if (success) {
      ui.alert('Success', 'Test daily report has been sent to your email.', ui.ButtonSet.OK);
    } else {
      ui.alert('Error', 'Failed to send test report. Check logs for details.', ui.ButtonSet.OK);
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'sendTestDailyReport', {}, true);
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