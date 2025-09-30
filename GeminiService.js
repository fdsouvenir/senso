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
  }
};