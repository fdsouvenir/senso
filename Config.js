/**
 * @OnlyCurrentDoc
 *
 * Central configuration file for the Senso Frontend Analytics System.
 * This file contains all configuration settings for daily reports, weekly roll-ups,
 * predictions, and system-wide constants.
 */

const Config = {
  // Project Settings
  GCP_PROJECT_ID: 'senso-473622',
  BIGQUERY_DATASET: 'restaurant_analytics',
  DRIVE_FOLDER_ID: '1MPXgywD-TvvsB1bFVDQ3CocujcF8ucia',

  // Email Configuration
  EMAIL: {
    SENDER_NAME: 'Senso Analytics',
    REPLY_TO: 'noreply@sensosushi.com',
    SUBJECT_PREFIX: '📊 Senso',
    MAX_RETRIES: 3
  },

  // Report Settings
  REPORTS: {
    daily: {
      enabled: true,
      time: '08:00',
      timezone: 'America/Chicago',
      daysActive: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      lookbackDays: 7,  // Compare to same day last week
      trendWeeks: 3,    // Show trend for last 3 weeks
      topItemsPerCategory: 5,  // Top 5 items per category
      categories: [
        'Signature Rolls',
        'Small Bites',
        'Nigiri',
        'Sashimi',
        'Wine',
        'Beer',
        'Cocktails',
        'Sake',
        'Non-Alcoholic'
      ]
    },
    weekly: {
      enabled: true,
      day: 'Monday',
      time: '08:00',
      timezone: 'America/Chicago',
      significantChangeThreshold: 25,  // Percent change to highlight
      historicalWeeksToCompare: 4,
      includeForecasts: true
    }
  },

  // Prediction Configuration
  PREDICTIONS: {
    enabled: true,
    trackAccuracy: true,
    confidenceThreshold: 6,  // Minimum confidence score (1-10)
    historicalDaysToConsider: 365,
    predictionHorizon: {
      daily: 1,   // Predict next day
      weekly: 7   // Predict next week
    },
    modelConfig: {
      temperature: 0.3,  // Lower = more consistent
      maxTokens: 500
    }
  },

  // Chart Configuration
  CHARTS: {
    apiEndpoint: 'https://chart.googleapis.com/chart',
    defaultWidth: 600,
    defaultHeight: 300,
    colors: {
      primary: '4285F4',
      secondary: '34A853',
      accent: 'FBBC04',
      negative: 'EA4335'
    },
    types: {
      comparison: 'bar',
      trend: 'line',
      distribution: 'pie',
      correlation: 'scatter'
    }
  },

  // Query Processing
  QUERY: {
    maxQueryLength: 500,
    cacheExpirationMinutes: 60,
    maxResultRows: 1000,
    timeout: 30000,  // 30 seconds
    commonPatterns: [
      { pattern: /top (\d+) (.+) for the last (\d+) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, type: 'dayOfWeekTrend' },
      { pattern: /compare (.+) vs (.+)/i, type: 'comparison' },
      { pattern: /show me (.+) from (.+) to (.+)/i, type: 'dateRange' },
      { pattern: /what were my (.+) sales (yesterday|today|last week)/i, type: 'salesQuery' },
      { pattern: /forecast|predict (.+)/i, type: 'prediction' }
    ]
  },

  // Web App Settings (for form submissions)
  WEB_APP: {
    url: 'https://script.google.com/macros/s/AKfycbxW0SkKpUH5C3i7O05KtxOi5BFPX7zQxR4rYnZXAXIHDUp61iPNZTGJb6if4EPGA5ER7g/exec',
    corsAllowedOrigins: ['https://mail.google.com'],
    enabled: true
  },

  // System Settings
  SYSTEM: {
    executionTimeLimit: 6 * 60 * 1000,  // 6 minutes in milliseconds
    timeBuffer: 2 * 60 * 1000,          // 2 minutes buffer
    retryInterval: 30 * 1000,           // 30 seconds
    maxRetries: 3,
    loggingLevel: 'INFO',  // DEBUG, INFO, WARN, ERROR
    errorNotificationEnabled: true
  },

  // BigQuery Tables
  TABLES: {
    reports: 'reports',
    metrics: 'metrics',
    predictions: 'predictions_tracking',
    userQueries: 'user_queries',
    systemLogs: 'system_logs',
    emailEngagement: 'email_engagement'
  },

  // Gemini API Configuration
  GEMINI: {
    model: 'gemini-flash-lite-latest',
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    timeout: 90000,  // 90 seconds
    maxRetries: 2
  },

  /**
   * Get secure configuration value from Script Properties
   * @param {string} key The property key
   * @returns {string} The property value
   */
  getSecure(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    if (!value) {
      throw new Error(`Missing required secure configuration: ${key}`);
    }
    return value;
  },

  /**
   * Get user preference from User Properties
   * @param {string} key The preference key
   * @param {any} defaultValue Default value if not set
   * @returns {any} The preference value
   */
  getUserPreference(key, defaultValue = null) {
    const value = PropertiesService.getUserProperties().getProperty(key);
    return value ? JSON.parse(value) : defaultValue;
  },

  /**
   * Set user preference in User Properties
   * @param {string} key The preference key
   * @param {any} value The preference value
   */
  setUserPreference(key, value) {
    PropertiesService.getUserProperties().setProperty(key, JSON.stringify(value));
  },

  /**
   * Validate configuration on startup
   * @returns {boolean} True if configuration is valid
   */
  validate() {
    const required = ['GCP_PROJECT_ID', 'BIGQUERY_DATASET', 'DRIVE_FOLDER_ID'];
    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    // Check for secure keys
    try {
      this.getSecure('GEMINI_API_KEY');
      this.getSecure('GCP_SERVICE_ACCOUNT_KEY');
      this.getSecure('GCP_SERVICE_ACCOUNT_EMAIL');
    } catch (error) {
      Logger.log('Warning: Secure configuration not set. Please configure Script Properties.');
      return false;
    }

    return true;
  },

  /**
   * Get formatted date in the configured timezone
   * @param {Date} date The date to format
   * @returns {string} Formatted date string
   */
  formatDate(date = new Date()) {
    return Utilities.formatDate(date, this.REPORTS.daily.timezone, 'yyyy-MM-dd');
  },

  /**
   * Get formatted datetime in the configured timezone
   * @param {Date} date The date to format
   * @returns {string} Formatted datetime string
   */
  formatDateTime(date = new Date()) {
    return Utilities.formatDate(date, this.REPORTS.daily.timezone, 'yyyy-MM-dd HH:mm:ss');
  }
};

// Validate configuration on load
try {
  Config.validate();
} catch (error) {
  Logger.log(`Configuration validation failed: ${error.toString()}`);
}