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
  SpreadsheetApp.getUi()
    .createMenu('Restaurant Analytics')
    .addItem('ONE-TIME SETUP: Authorize & Activate', 'runInitialSetup')
    .addSeparator()
    .addItem('Run Full Data Ingestion (Manual)', 'startFullIngestion')
    .addItem('Show Status Dashboard', 'showDashboard')
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