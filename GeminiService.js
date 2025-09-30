/**
 * @OnlyCurrentDoc
 * 
 * Handles all communication with the Google Gemini API.
 * This version uses the correct payload structure for multimodal requests.
 */

// --- CONFIGURATION ---
// API key is now securely stored in Script Properties
// Use SecureConfig.initialize() to set it up
// --------------------

const GeminiService = {
  /**
   * Get the Gemini API endpoint with the API key
   * @returns {string} Complete API endpoint URL
   */
  getApiEndpoint: function() {
    const apiKey = SecureConfig.getGeminiAPIKey();
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
  },

  /**
   * Sends a PDF file to Gemini and asks it to extract structured data.
   * @param {DriveApp.File} file The PDF file to parse.
   * @returns {object|null} A parsed JSON object with the report data, or null on failure.
   */
  extractDataFromPdf: function(file) {
    // Rate limiting check - max 10 requests per minute for Gemini API
    const rateLimitKey = 'gemini_api_' + Session.getActiveUser().getEmail();
    if (!SecurityUtils.checkRateLimit(rateLimitKey, 10, 60)) {
      throw new Error('Gemini API rate limit exceeded. Please wait a moment before trying again.');
    }

    const prompt = `
      You are an expert data extraction API. Your only function is to analyze the provided PDF Product Mix report and convert it into a structured JSON object.

      The JSON object must have two root keys: "reportData" and "metricsData".

      1.  **reportData**: This object must contain the header information.
          - "location": The location name (e.g., "Senso, Frankfort").
          - "report_date": The "Start Date" from the report, formatted strictly as YYYY-MM-DD.
      
      2.  **metricsData**: This must be an array of objects. Each object represents a single line item from the tables in the report. Each object must have the following keys:
          - "category": The main category of the item (e.g., "Beer", "Food", "Sushi").
          - "item_name": The specific name of the item (e.g., "Sapporo", "Crab Rangoon").
          - "quantity_sold": The numeric value from the "Quantity Sold" column. Convert to a number.
          - "net_sales": The numeric value from the "Net Sales" column. Convert to a number.
          - "discounts": The numeric value from the "Discounts" column. Convert to a number.
          
      Analyze the entire document. If the document contains the text "No Data", return an empty JSON object {}.
    `;

    const fileBlob = file.getBlob();
    
    // THIS IS THE CORRECTED PAYLOAD STRUCTURE
    const payload = {
      "contents": [{
        "role": "user", // The required 'role' key
        "parts": [
          { "text": prompt }, // Part 1: The text prompt
          { "inline_data": { "mime_type": "application/pdf", "data": Utilities.base64Encode(fileBlob.getBytes()) } } // Part 2: The PDF data
        ]
      }],
      "generationConfig": {
        "responseMimeType": "application/json"
      }
    };

    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true,
      'deadline': 90 
    };
    
    const response = UrlFetchApp.fetch(this.getApiEndpoint(), options);
    const responseText = response.getContentText();

    try {
      const parsedResponse = JSON.parse(responseText);

      if (parsedResponse.error) {
        throw new Error(`Gemini API Error: ${parsedResponse.error.message}`);
      }
      
      const resultText = parsedResponse.candidates[0].content.parts[0].text;
      return JSON.parse(resultText);

    } catch (e) {
      Logger.log(`Failed to parse structured JSON response for file ${file.getName()}: ${e.toString()}`);
      Logger.log(`Original raw response from Gemini: ${responseText}`);
      return null;
    }
  },

  /**
   * Generate AI-powered weekly insight based on performance data
   * @param {Object} weekData Weekly report data including metrics and changes
   * @returns {string} Generated insight text
   */
  generateWeeklyInsight: function(weekData) {
    try {
      // Rate limiting check
      const rateLimitKey = 'gemini_insight_' + Session.getActiveUser().getEmail();
      if (!SecurityUtils.checkRateLimit(rateLimitKey, 5, 60)) {
        Logger.log('Gemini insight rate limit exceeded, using fallback');
        return null;
      }

      // Prepare context for AI analysis
      const topChanges = (weekData.significantChanges || []).slice(0, 3)
        .map(c => `${c.item}: ${c.description}`)
        .join('; ');

      const topCategories = (weekData.categoryPerformance || []).slice(0, 3)
        .map(c => `${c.category}: ${c.changePercent > 0 ? '+' : ''}${c.changePercent.toFixed(0)}%`)
        .join(', ');

      const prompt = `
        You are a restaurant analytics expert. Generate ONE concise, actionable insight (max 2 sentences) based on this week's performance data.

        Week Total: $${weekData.weekTotal}
        Change vs Last Week: ${weekData.weekComparison}%
        Best Day: ${weekData.bestDay}
        Top Category Changes: ${topCategories}
        Notable Item Changes: ${topChanges}

        Focus on the most important finding. Be specific - mention actual items or categories.
        If performance is good, highlight what's driving it. If declining, identify the main concern.
        Do not use generic phrases like "strong week" or "growth across categories".

        Return only the insight text, no formatting or labels.
      `;

      const payload = {
        "contents": [{
          "role": "user",
          "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
          "temperature": 0.3,
          "maxOutputTokens": 100
        }
      };

      const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload),
        'muteHttpExceptions': true,
        'deadline': 10
      };

      const response = UrlFetchApp.fetch(this.getApiEndpoint(), options);
      const responseJson = JSON.parse(response.getContentText());

      if (responseJson.candidates && responseJson.candidates[0]) {
        const insight = responseJson.candidates[0].content.parts[0].text.trim();
        Logger.log('AI insight generated: ' + insight);
        return insight;
      }

      return null;
    } catch (error) {
      Logger.log('Failed to generate AI insight: ' + error.toString());
      return null;
    }
  }
};