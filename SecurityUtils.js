/**
 * @OnlyCurrentDoc
 *
 * Security Utilities for input sanitization and HTML escaping
 */

const SecurityUtils = {
  /**
   * Escape HTML special characters to prevent XSS attacks
   * @param {string} str Input string to escape
   * @returns {string} HTML-escaped string
   */
  escapeHtml(str) {
    if (str == null) return '';

    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };

    return String(str).replace(/[&<>"'`=\/]/g, char => htmlEscapes[char]);
  },

  /**
   * Escape HTML attributes
   * @param {string} attr Attribute value to escape
   * @returns {string} Escaped attribute value
   */
  escapeAttribute(attr) {
    if (attr == null) return '';
    return String(attr).replace(/[^a-zA-Z0-9-_]/g, '');
  },

  /**
   * Sanitize numeric input
   * @param {*} value Input value
   * @param {number} defaultValue Default if invalid
   * @returns {number} Sanitized number
   */
  sanitizeNumber(value, defaultValue = 0) {
    const num = Number(value);
    return isNaN(num) || !isFinite(num) ? defaultValue : num;
  },

  /**
   * Sanitize date string
   * @param {string} dateStr Date string to sanitize
   * @returns {string} Sanitized date string or empty string
   */
  sanitizeDate(dateStr) {
    if (!dateStr) return '';

    // Allow only YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return '';

    // Validate it's a real date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    return dateStr;
  },

  /**
   * Sanitize email address
   * @param {string} email Email to sanitize
   * @returns {string} Sanitized email or empty string
   */
  sanitizeEmail(email) {
    if (!email) return '';

    // Basic email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) ? email : '';
  },

  /**
   * Sanitize BigQuery table/dataset names
   * @param {string} identifier Table or dataset name
   * @returns {string} Sanitized identifier
   */
  sanitizeBigQueryIdentifier(identifier) {
    if (!identifier) return '';

    // BigQuery identifiers: letters, numbers, underscores only
    // Must start with letter or underscore
    const sanitized = String(identifier).replace(/[^a-zA-Z0-9_]/g, '');

    // Ensure it starts with letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      return '_' + sanitized;
    }

    return sanitized;
  },

  /**
   * Sanitize SQL string literal (for BigQuery)
   * @param {string} str String to use in SQL
   * @returns {string} SQL-safe string
   */
  sanitizeSqlString(str) {
    if (str == null) return '';

    // Escape single quotes by doubling them
    return String(str).replace(/'/g, "''");
  },

  /**
   * Validate and sanitize JSON data
   * @param {string} jsonStr JSON string to validate
   * @returns {Object|null} Parsed JSON or null if invalid
   */
  sanitizeJson(jsonStr) {
    if (!jsonStr) return null;

    try {
      const parsed = JSON.parse(jsonStr);
      // Re-stringify and parse to remove any dangerous content
      return JSON.parse(JSON.stringify(parsed));
    } catch (e) {
      Logger.log('Invalid JSON input: ' + e.toString());
      return null;
    }
  },

  /**
   * Sanitize file path
   * @param {string} path File path to sanitize
   * @returns {string} Sanitized path
   */
  sanitizeFilePath(path) {
    if (!path) return '';

    // Remove any path traversal attempts
    return String(path)
      .replace(/\.\./g, '')
      .replace(/\/\//g, '/')
      .replace(/\\/g, '/')
      .substring(0, 255); // Limit length
  },

  /**
   * Create safe HTML from template with data
   * @param {string} template HTML template with ${key} placeholders
   * @param {Object} data Data object with values
   * @returns {string} Safe HTML with escaped values
   */
  safeTemplate(template, data) {
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const value = data[key.trim()];
      return this.escapeHtml(value);
    });
  },

  /**
   * Validate URL
   * @param {string} url URL to validate
   * @returns {boolean} True if valid URL
   */
  isValidUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (e) {
      return false;
    }
  },

  /**
   * Generate secure random token
   * @param {number} length Token length
   * @returns {string} Random token
   */
  generateToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      token += chars[randomIndex];
    }

    return token;
  },

  /**
   * Rate limiting check
   * @param {string} key Unique key for the action
   * @param {number} maxAttempts Maximum attempts allowed
   * @param {number} windowSeconds Time window in seconds
   * @returns {boolean} True if action is allowed
   */
  checkRateLimit(key, maxAttempts = 10, windowSeconds = 60) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'rate_limit_' + key;
    const currentTime = Date.now();
    const windowMs = windowSeconds * 1000;

    // Get existing attempts
    const cachedData = cache.get(cacheKey);
    let attempts = [];

    if (cachedData) {
      try {
        attempts = JSON.parse(cachedData);
      } catch (e) {
        attempts = [];
      }
    }

    // Filter out old attempts
    attempts = attempts.filter(timestamp =>
      currentTime - timestamp < windowMs
    );

    // Check if limit exceeded
    if (attempts.length >= maxAttempts) {
      return false;
    }

    // Add current attempt
    attempts.push(currentTime);

    // Save back to cache
    cache.put(cacheKey, JSON.stringify(attempts), windowSeconds);

    return true;
  }
};