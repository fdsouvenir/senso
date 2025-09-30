# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Senso is a Google Apps Script ETL pipeline that automates the processing of restaurant Product Mix reports from Gmail attachments to BigQuery for analytics. The system runs serverless within Google's infrastructure.

## Commands

### Deployment
```bash
# Deploy code to Google Apps Script
clasp push

# Pull code from Apps Script
clasp pull

# View execution logs
clasp logs
```

### Testing
Manual testing is done via custom menu in Google Sheets:
- "ONE-TIME SETUP: Authorize & Activate" - Initial authorization
- "Run Full Data Ingestion (Manual)" - Manual execution
- "Show Status Dashboard" - Monitor progress

## Architecture

### Data Flow
```
Gmail → GmailHarvester.js → Drive Storage
    → PmixParser.js → GeminiService.js (AI parsing)
        → BigQueryLoader.js → BigQuery Tables
```

### Core Components
- **Code.js**: Main orchestration, trigger management, 6-minute execution limit handling
- **GmailHarvester.js**: Extracts PDF attachments from spoton.com emails
- **PmixParser.js**: Structures data for BigQuery using Gemini AI
- **GeminiService.js**: AI-powered PDF parsing via Gemini Flash Lite
- **BigQueryLoader.js**: Loads to `senso-473622.restaurant_analytics` dataset
- **Auth.gs.js**: Service account OAuth for BigQuery
- **Dashboard.js/html**: Real-time status monitoring sidebar

### Configuration Points
- GCP Project: `senso-473622`
- Drive Folder ID: `1MPXgywD-TvvsB1bFVDQ3CocujcF8ucia`
- Script ID: `14x76K-7AsZ7aTLnGYWhJ7tmVsj46xw7av8VnD7uCl9U3xGTRUCEM9P9_`
- BigQuery Dataset: `restaurant_analytics`
- Execution time limit: 6 minutes (4-minute buffer for safety)

### Development Patterns
- Object literal modules (e.g., `PmixParser`, `GeminiService`)
- Continuation tokens for long-running processes
- Exponential backoff for API retries
- PropertiesService for state management
- Time-based triggers for automation

### Security Notes
- API keys and service account credentials are currently hardcoded - move to Script Properties
- Uses `@OnlyCurrentDoc` JSDoc for security
- Service Account: `apps-script-bigquery-etl@senso-473622.iam.gserviceaccount.com`

### Dependencies
- OAuth2 library: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
- BigQuery Advanced Service v2
- Google Gemini API (external)