/**
 * @OnlyCurrentDoc
 *
 * Secure Configuration Management
 * Handles all sensitive configuration using Script Properties
 */

const SecureConfig = {
  /**
   * Initialize secure configuration in Script Properties
   * Run this once manually to set up credentials
   */
  initialize() {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      'Security Configuration Setup',
      'This will guide you through setting up secure credentials.\n\n' +
      'You\'ll need:\n' +
      '1. GCP Service Account Private Key\n' +
      '2. Gemini API Key\n\n' +
      'Continue?',
      ui.ButtonSet.YES_NO
    );

    if (result !== ui.Button.YES) {
      return;
    }

    const scriptProperties = PropertiesService.getScriptProperties();

    // Get GCP Private Key
    const privateKeyPrompt = ui.prompt(
      'GCP Service Account Private Key',
      'Paste your entire private key (including BEGIN/END lines):',
      ui.ButtonSet.OK_CANCEL
    );

    if (privateKeyPrompt.getSelectedButton() === ui.Button.OK) {
      const privateKey = privateKeyPrompt.getResponseText();
      if (privateKey && privateKey.includes('BEGIN PRIVATE KEY')) {
        scriptProperties.setProperty('GCP_PRIVATE_KEY', privateKey);
        Logger.log('GCP Private Key stored securely');
      } else {
        ui.alert('Invalid private key format');
        return;
      }
    } else {
      return;
    }

    // Get Gemini API Key
    const geminiKeyPrompt = ui.prompt(
      'Gemini API Key',
      'Enter your Gemini API key:',
      ui.ButtonSet.OK_CANCEL
    );

    if (geminiKeyPrompt.getSelectedButton() === ui.Button.OK) {
      const geminiKey = geminiKeyPrompt.getResponseText();
      if (geminiKey && geminiKey.length > 20) {
        scriptProperties.setProperty('GEMINI_API_KEY', geminiKey);
        Logger.log('Gemini API Key stored securely');
      } else {
        ui.alert('Invalid API key');
        return;
      }
    } else {
      return;
    }

    // Store service account email (not sensitive)
    scriptProperties.setProperty('GCP_SERVICE_ACCOUNT_EMAIL',
      'apps-script-bigquery-etl@senso-473622.iam.gserviceaccount.com');

    ui.alert('Configuration Complete',
      'Credentials have been securely stored in Script Properties.\n\n' +
      'You can now remove any hardcoded credentials from your code.',
      ui.ButtonSet.OK);
  },

  /**
   * Get GCP Service Account credentials
   * @returns {Object} Object with privateKey and clientEmail
   */
  getGCPCredentials() {
    const scriptProperties = PropertiesService.getScriptProperties();
    const privateKey = scriptProperties.getProperty('GCP_PRIVATE_KEY');
    const clientEmail = scriptProperties.getProperty('GCP_SERVICE_ACCOUNT_EMAIL');

    if (!privateKey || !clientEmail) {
      throw new Error(
        'GCP credentials not configured. Run SecureConfig.initialize() from the ' +
        'script editor or use the menu: Setup > Configure Secure Credentials'
      );
    }

    return {
      privateKey: privateKey,
      clientEmail: clientEmail
    };
  },

  /**
   * Get Gemini API Key
   * @returns {string} Gemini API key
   */
  getGeminiAPIKey() {
    const scriptProperties = PropertiesService.getScriptProperties();
    const apiKey = scriptProperties.getProperty('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'Gemini API key not configured. Run SecureConfig.initialize() from the ' +
        'script editor or use the menu: Setup > Configure Secure Credentials'
      );
    }

    return apiKey;
  },

  /**
   * Check if credentials are configured
   * @returns {Object} Status of each credential
   */
  checkConfiguration() {
    const scriptProperties = PropertiesService.getScriptProperties();

    return {
      gcpPrivateKey: !!scriptProperties.getProperty('GCP_PRIVATE_KEY'),
      gcpServiceAccount: !!scriptProperties.getProperty('GCP_SERVICE_ACCOUNT_EMAIL'),
      geminiApiKey: !!scriptProperties.getProperty('GEMINI_API_KEY')
    };
  },

  /**
   * Clear all stored credentials (use with caution)
   */
  clearCredentials() {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      'Clear All Credentials?',
      'This will remove all stored credentials. You\'ll need to reconfigure them.\n\n' +
      'Are you sure?',
      ui.ButtonSet.YES_NO
    );

    if (result === ui.Button.YES) {
      const scriptProperties = PropertiesService.getScriptProperties();
      scriptProperties.deleteProperty('GCP_PRIVATE_KEY');
      scriptProperties.deleteProperty('GCP_SERVICE_ACCOUNT_EMAIL');
      scriptProperties.deleteProperty('GEMINI_API_KEY');

      ui.alert('Credentials cleared. Run Setup > Configure Secure Credentials to reconfigure.');
    }
  }
};