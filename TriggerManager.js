/**
 * @OnlyCurrentDoc
 *
 * Trigger Manager - Handles automated trigger setup for reports
 */

const TriggerManager = {
  /**
   * Set up daily report trigger
   * Runs Tuesday-Sunday at 8 AM
   */
  setupDailyReportTrigger() {
    const ui = SpreadsheetApp.getUi();

    try {
      // Remove existing daily report triggers
      this.removeTriggersByFunction('runDailyReportTrigger');

      // Create trigger for Tuesday-Sunday at 8 AM
      ScriptApp.newTrigger('runDailyReportTrigger')
        .timeBased()
        .everyDays(1)
        .atHour(8)
        .create();

      ui.alert('✅ Daily Report Trigger Set',
        'Daily reports will be sent Tuesday-Sunday at 8:00 AM.\n\n' +
        'Note: Reports will automatically skip Mondays (weekly report day).',
        ui.ButtonSet.OK);

      Logger.log('Daily report trigger created successfully');
      return true;
    } catch (error) {
      ui.alert('❌ Error Setting Trigger',
        'Failed to set daily report trigger:\n' + error.toString(),
        ui.ButtonSet.OK);
      Logger.log('Error setting daily trigger: ' + error.toString());
      return false;
    }
  },

  /**
   * Set up weekly report trigger
   * Runs every Monday at 8 AM
   */
  setupWeeklyReportTrigger() {
    const ui = SpreadsheetApp.getUi();

    try {
      // Remove existing weekly report triggers
      this.removeTriggersByFunction('runWeeklyReportTrigger');

      // Create trigger for Monday at 8 AM
      ScriptApp.newTrigger('runWeeklyReportTrigger')
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay.MONDAY)
        .atHour(8)
        .create();

      ui.alert('✅ Weekly Report Trigger Set',
        'Weekly roll-up reports will be sent every Monday at 8:00 AM.',
        ui.ButtonSet.OK);

      Logger.log('Weekly report trigger created successfully');
      return true;
    } catch (error) {
      ui.alert('❌ Error Setting Trigger',
        'Failed to set weekly report trigger:\n' + error.toString(),
        ui.ButtonSet.OK);
      Logger.log('Error setting weekly trigger: ' + error.toString());
      return false;
    }
  },

  /**
   * Set up all report triggers
   */
  setupAllReportTriggers() {
    const dailySuccess = this.setupDailyReportTrigger();
    const weeklySuccess = this.setupWeeklyReportTrigger();

    if (dailySuccess && weeklySuccess) {
      SpreadsheetApp.getUi().alert('✅ All Triggers Set',
        'Both daily and weekly report triggers have been configured successfully.',
        SpreadsheetApp.getUi().ButtonSet.OK);
    }
  },

  /**
   * Remove all report triggers
   */
  removeAllReportTriggers() {
    const ui = SpreadsheetApp.getUi();

    const result = ui.alert('⚠️ Remove All Report Triggers?',
      'This will stop all automated daily and weekly reports.\n\n' +
      'Are you sure you want to continue?',
      ui.ButtonSet.YES_NO);

    if (result !== ui.Button.YES) {
      return;
    }

    try {
      this.removeTriggersByFunction('runDailyReportTrigger');
      this.removeTriggersByFunction('runWeeklyReportTrigger');

      ui.alert('✅ Triggers Removed',
        'All report triggers have been removed.\n\n' +
        'Reports will no longer be sent automatically.',
        ui.ButtonSet.OK);

      Logger.log('All report triggers removed');
    } catch (error) {
      ui.alert('❌ Error',
        'Failed to remove triggers:\n' + error.toString(),
        ui.ButtonSet.OK);
    }
  },

  /**
   * View current trigger status
   */
  viewTriggerStatus() {
    const ui = SpreadsheetApp.getUi();
    const triggers = ScriptApp.getProjectTriggers();

    let message = 'Current Report Triggers:\n\n';

    const reportTriggers = triggers.filter(trigger => {
      const handlerFunction = trigger.getHandlerFunction();
      return handlerFunction === 'runDailyReportTrigger' ||
             handlerFunction === 'runWeeklyReportTrigger';
    });

    if (reportTriggers.length === 0) {
      message += '❌ No report triggers are currently set.\n\n';
      message += 'Use the menu to set up automated reports.';
    } else {
      reportTriggers.forEach(trigger => {
        const funcName = trigger.getHandlerFunction();
        const type = trigger.getEventType();

        if (funcName === 'runDailyReportTrigger') {
          message += '📊 Daily Report: Active (Tuesday-Sunday @ 8 AM)\n';
        } else if (funcName === 'runWeeklyReportTrigger') {
          message += '📈 Weekly Report: Active (Monday @ 8 AM)\n';
        }
      });

      message += '\n✅ Reports are running automatically.';
    }

    // Also show other important triggers
    const otherTriggers = triggers.filter(trigger => {
      const handlerFunction = trigger.getHandlerFunction();
      return handlerFunction !== 'runDailyReportTrigger' &&
             handlerFunction !== 'runWeeklyReportTrigger';
    });

    if (otherTriggers.length > 0) {
      message += '\n\nOther Active Triggers:\n';
      otherTriggers.forEach(trigger => {
        message += `• ${trigger.getHandlerFunction()}\n`;
      });
    }

    ui.alert('🔔 Trigger Status', message, ui.ButtonSet.OK);
  },

  /**
   * Remove triggers by function name
   * @param {string} functionName Function name to remove triggers for
   */
  removeTriggersByFunction(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === functionName) {
        ScriptApp.deleteTrigger(trigger);
        Logger.log(`Removed trigger for ${functionName}`);
      }
    });
  },

  /**
   * Test trigger configuration
   */
  testTriggerConfiguration() {
    const ui = SpreadsheetApp.getUi();

    try {
      // Check if credentials are configured
      const credStatus = SecureConfig.checkConfiguration();
      if (!credStatus.gcpPrivateKey || !credStatus.geminiApiKey) {
        ui.alert('⚠️ Configuration Incomplete',
          'Please configure secure credentials first.\n\n' +
          'Use: Restaurant Analytics → 🔐 Configure Secure Credentials',
          ui.ButtonSet.OK);
        return;
      }

      // Check if email is configured
      if (!Config.EMAIL.defaultRecipient) {
        ui.alert('⚠️ Email Not Configured',
          'Please configure email recipient in Config.js',
          ui.ButtonSet.OK);
        return;
      }

      ui.alert('✅ Configuration Test Passed',
        'System is ready for automated reports.\n\n' +
        'You can now set up report triggers from the menu.',
        ui.ButtonSet.OK);

    } catch (error) {
      ui.alert('❌ Configuration Test Failed',
        'Error: ' + error.toString(),
        ui.ButtonSet.OK);
    }
  }
};

/**
 * Trigger handler for daily reports
 * This function is called by the time-based trigger
 */
function runDailyReportTrigger() {
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Skip Monday (weekly report day)
  if (dayOfWeek === 'Monday') {
    Logger.log('Skipping daily report on Monday (weekly report day)');
    return;
  }

  try {
    Logger.log(`Running scheduled daily report for ${dayOfWeek}`);

    // Generate and send daily report
    const reportData = DailyReport.generate();
    const emailSent = EmailService.sendDailyReport(reportData);

    if (emailSent) {
      Logger.log('Daily report sent successfully');
    } else {
      throw new Error('Failed to send daily report email');
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'runDailyReportTrigger');

    // Try to send error notification
    try {
      MailApp.sendEmail({
        to: Config.EMAIL.defaultRecipient || Session.getActiveUser().getEmail(),
        subject: '❌ Daily Report Failed',
        body: `The daily report failed to generate.\n\nError: ${error.toString()}\n\nPlease check the logs for details.`
      });
    } catch (e) {
      Logger.log('Failed to send error notification: ' + e.toString());
    }
  }
}

/**
 * Trigger handler for weekly reports
 * This function is called by the time-based trigger
 */
function runWeeklyReportTrigger() {
  try {
    Logger.log('Running scheduled weekly report for Monday');

    // Generate and send weekly report
    const reportData = WeeklyReport.generate();
    const emailSent = EmailService.sendWeeklyReport(reportData);

    if (emailSent) {
      Logger.log('Weekly report sent successfully');
    } else {
      throw new Error('Failed to send weekly report email');
    }
  } catch (error) {
    ErrorHandler.handleError(error, 'runWeeklyReportTrigger');

    // Try to send error notification
    try {
      MailApp.sendEmail({
        to: Config.EMAIL.defaultRecipient || Session.getActiveUser().getEmail(),
        subject: '❌ Weekly Report Failed',
        body: `The weekly report failed to generate.\n\nError: ${error.toString()}\n\nPlease check the logs for details.`
      });
    } catch (e) {
      Logger.log('Failed to send error notification: ' + e.toString());
    }
  }
}