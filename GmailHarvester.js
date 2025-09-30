/**
 * @OnlyCurrentDoc
 * 
 * This script is the "Gmail Harvester." It finds new report emails based on a search,
 * processes them, and records their unique Message IDs with a timestamp.
 * It also includes a cleanup function to prune old message IDs, creating a rolling buffer.
 */

// --- CONFIGURATION ---
// This must be the same Drive Folder ID used in Code.gs.
// ACTION REQUIRED: Make sure this is your correct Drive Folder ID.
const TARGET_DRIVE_FOLDER_ID = '1MPXgywD-TvvsB1bFVDQ3CocujcF8ucia'; 
const SEARCH_WINDOW_DAYS = 7;
const LOG_RETENTION_DAYS = 10; // Store message IDs for 10 days, providing a safe buffer.
// --------------------

/**
 * The main function to be run on a recurring trigger.
 * Searches for report emails and processes any that have not been logged before.
 */
function harvestNewPdfsFromGmail() {
  Logger.log('Starting Gmail Harvester...');
  
  const searchQuery = `from:no-reply@spoton.com has:attachment newer_than:${SEARCH_WINDOW_DAYS}d`;
  const folder = DriveApp.getFolderById(TARGET_DRIVE_FOLDER_ID);
  const processedLog = PropertiesService.getUserProperties();
  
  const threads = GmailApp.search(searchQuery);
  
  if (threads.length === 0) {
    Logger.log('No recent report emails found.');
    return;
  }
  
  Logger.log(`Found ${threads.length} recent email thread(s) to check.`);

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      const messageId = message.getId();

      if (processedLog.getProperty(messageId)) {
        continue;
      }

      const attachments = message.getAttachments();
      for (const attachment of attachments) {
        if (attachment.getContentType() === 'application/pdf' && attachment.getName().startsWith('pmix-')) {
          try {
            folder.createFile(attachment.copyBlob());
            Logger.log(`Successfully saved attachment: ${attachment.getName()}`);
            
            // Log this message ID as processed with the current timestamp.
            processedLog.setProperty(messageId, new Date().getTime().toString());
            
          } catch (e) {
            Logger.log(`Error saving attachment ${attachment.getName()} from message ID ${messageId}: ${e.toString()}`);
          }
        }
      }
    }
  }
  Logger.log('Gmail Harvester finished.');
}

/**
 * A maintenance function to clean up old message IDs from the log.
 * This should be run on a daily trigger.
 */
function cleanOldMessageIds() {
  Logger.log('Starting daily cleanup of old message IDs...');
  const userProperties = PropertiesService.getUserProperties();
  const allKeys = userProperties.getKeys();
  const now = new Date().getTime();
  const cutoff = now - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let deletedCount = 0;

  for (const key of allKeys) {
    // We only want to clean up message IDs, not our other status properties.
    // A simple check is to see if it's not one of our known config keys.
    if (key.length > 20) { // Message IDs are long, our status keys are short.
      const timestamp = parseInt(userProperties.getProperty(key));
      if (timestamp < cutoff) {
        userProperties.deleteProperty(key);
        deletedCount++;
      }
    }
  }
  Logger.log(`Cleanup complete. Removed ${deletedCount} old message ID(s).`);
}