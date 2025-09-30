/**
 * @OnlyCurrentDoc
 * 
 * Contains all functions related to the Status Dashboard sidebar.
 */

/**
 * Shows the status dashboard sidebar in the spreadsheet.
 * Called from the 'Restaurant Analytics' menu.
 */
function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('DashboardHtml')
      .setTitle('Ingestion Status')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Gets the current status from PropertiesService.
 * This function is called by the HTML in the sidebar.
 * @returns {object} An object containing the current status details.
 */
function getStatus() {
  const userProperties = PropertiesService.getUserProperties();
  const status = userProperties.getProperty('ingestionStatus') || 'Idle';
  const processedCount = userProperties.getProperty('processedCount') || '0';
  const lastRun = userProperties.getProperty('lastRunTimestamp') || 'N/A';
  
  return {
    status: status,
    processedCount: processedCount,
    lastRun: lastRun
  };
}

// NOTE: You will need to create the 'DashboardHtml.html' file next.