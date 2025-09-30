/**
 * @OnlyCurrentDoc
 *
 * Handles authentication for Google Cloud Platform services using a service account.
 * This ensures the script has the necessary permissions to interact with BigQuery and Gmail API.
 */

// --- CONFIGURATION ---
// Credentials are now securely stored in Script Properties
// Use SecureConfig.initialize() to set them up
// --------------------


/**
 * Creates and returns an authorized service for interacting with the BigQuery API.
 * Caches the service object for the duration of the script execution.
 * @returns {object} An authorized BigQuery service object.
 */
function getBigQueryService() {
  // Caching the service object for efficiency during a single script run.
  if (this.service) {
    return this.service;
  }

  // Get credentials from SecureConfig
  const credentials = SecureConfig.getGCPCredentials();

  // Use the OAuth2 for Apps Script library to create a service account flow.
  const service = OAuth2.createServiceAccountFlow({
    privateKey: credentials.privateKey,
    clientEmail: credentials.clientEmail,
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  });

  this.service = service;
  return this.service;
}

/**
 * Creates and returns an authorized service for interacting with the Gmail API.
 * Requires domain-wide delegation for Google Workspace.
 * @param {string} userEmail The email to impersonate (must be in the Google Workspace domain)
 * @returns {object} An authorized Gmail service object.
 */
function getGmailService(userEmail = 'reports@sensosushi.com') {
  // Cache key includes user email to support different impersonations
  const cacheKey = `gmail_service_${userEmail}`;

  if (this[cacheKey]) {
    return this[cacheKey];
  }

  try {
    // Get credentials from SecureConfig
    const credentials = SecureConfig.getGCPCredentials();

    // Create service with Gmail scopes and user impersonation
    const service = OAuth2.createServiceAccountFlow({
      privateKey: credentials.privateKey,
      clientEmail: credentials.clientEmail,
      scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.modify'
      ],
      subject: userEmail  // Domain-wide delegation - impersonate this user
    });

    this[cacheKey] = service;
    return service;
  } catch (error) {
    Logger.log(`Failed to create Gmail service for ${userEmail}: ${error.toString()}`);
    throw new Error('Gmail API authentication failed. Ensure domain-wide delegation is configured.');
  }
}

/**
 * Test if Gmail API with service account is properly configured
 * @returns {boolean} True if configured correctly
 */
function testGmailServiceAccount() {
  try {
    const service = getGmailService('reports@sensosushi.com');

    // Try to get the access token
    if (service.hasAccess()) {
      Logger.log('Gmail service account has access');
      return true;
    } else {
      Logger.log('Gmail service account does not have access');
      return false;
    }
  } catch (error) {
    Logger.log('Gmail service account test failed: ' + error.toString());
    return false;
  }
}