/**
 * @OnlyCurrentDoc
 * 
 * Handles authentication for Google Cloud Platform services using a service account.
 * This ensures the script has the necessary permissions to interact with BigQuery.
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