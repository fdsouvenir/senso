/**
 * @OnlyCurrentDoc
 *
 * Gmail API Service for sending emails from Google Workspace account
 * Supports both HTML and AMP email formats
 */

const GmailService = {
  /**
   * Send email using Gmail API with Google Workspace account
   * @param {Object} options Email options
   * @returns {boolean} Success status
   */
  sendEmail(options) {
    const {
      recipient,
      subject,
      htmlBody,
      ampBody = null,
      textBody = null,
      attachments = [],
      senderEmail = 'reports@sensosushi.com',
      senderName = 'Senso Analytics'
    } = options;

    try {
      // Create the MIME message
      const mimeMessage = this.createMimeMessage({
        from: `${senderName} <${senderEmail}>`,
        to: recipient,
        subject: subject,
        textBody: textBody || this.htmlToText(htmlBody),
        htmlBody: htmlBody,
        ampBody: ampBody,
        attachments: attachments
      });

      // Send via Gmail API
      const response = Gmail.Users.Messages.send({
        raw: mimeMessage
      }, senderEmail);

      Logger.log(`Email sent successfully via Gmail API. Message ID: ${response.id}`);
      return true;
    } catch (error) {
      Logger.log(`Failed to send email via Gmail API: ${error.toString()}`);

      // Fallback to MailApp if Gmail API fails
      try {
        Logger.log('Attempting fallback to MailApp...');
        MailApp.sendEmail({
          to: recipient,
          subject: subject,
          htmlBody: htmlBody,
          name: senderName,
          replyTo: senderEmail
        });
        Logger.log('Email sent successfully via MailApp (fallback)');
        return true;
      } catch (fallbackError) {
        Logger.log(`Fallback also failed: ${fallbackError.toString()}`);
        return false;
      }
    }
  },

  /**
   * Create MIME message for multipart email
   * @param {Object} parts Email parts
   * @returns {string} Base64 encoded MIME message
   */
  createMimeMessage(parts) {
    const boundary = `boundary_${Utilities.getUuid()}`;
    const nl = '\r\n';

    // Build headers
    let message = [
      `From: ${parts.from}`,
      `To: ${parts.to}`,
      `Subject: ${parts.subject}`,
      'MIME-Version: 1.0'
    ];

    // Add List-Unsubscribe header for better deliverability
    message.push('List-Unsubscribe: <mailto:unsubscribe@sensosushi.com>');

    // Determine content type based on parts
    if (parts.ampBody) {
      // Multipart email with AMP
      message.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      message.push('');

      // Text part
      message.push(`--${boundary}`);
      message.push('Content-Type: text/plain; charset="UTF-8"');
      message.push('Content-Transfer-Encoding: base64');
      message.push('');
      message.push(Utilities.base64Encode(parts.textBody, Utilities.Charset.UTF_8));

      // AMP HTML part (must come before regular HTML)
      message.push(`--${boundary}`);
      message.push('Content-Type: text/x-amp-html; charset="UTF-8"');
      message.push('Content-Transfer-Encoding: base64');
      message.push('');
      message.push(Utilities.base64Encode(parts.ampBody, Utilities.Charset.UTF_8));

      // HTML part
      message.push(`--${boundary}`);
      message.push('Content-Type: text/html; charset="UTF-8"');
      message.push('Content-Transfer-Encoding: base64');
      message.push('');
      message.push(Utilities.base64Encode(parts.htmlBody, Utilities.Charset.UTF_8));

      message.push(`--${boundary}--`);
    } else {
      // Regular HTML email
      message.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      message.push('');

      // Text part
      message.push(`--${boundary}`);
      message.push('Content-Type: text/plain; charset="UTF-8"');
      message.push('Content-Transfer-Encoding: base64');
      message.push('');
      message.push(Utilities.base64Encode(parts.textBody, Utilities.Charset.UTF_8));

      // HTML part
      message.push(`--${boundary}`);
      message.push('Content-Type: text/html; charset="UTF-8"');
      message.push('Content-Transfer-Encoding: base64');
      message.push('');
      message.push(Utilities.base64Encode(parts.htmlBody, Utilities.Charset.UTF_8));

      message.push(`--${boundary}--`);
    }

    // Join with CRLF and encode
    const fullMessage = message.join(nl);
    return Utilities.base64EncodeWebSafe(fullMessage);
  },

  /**
   * Convert HTML to plain text (simple version)
   * @param {string} html HTML content
   * @returns {string} Plain text
   */
  htmlToText(html) {
    // Remove HTML tags and decode entities
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Test Gmail API connection and permissions
   * @returns {Object} Test results
   */
  testConnection() {
    try {
      const senderEmail = 'reports@sensosushi.com';

      // Try to get user profile
      const profile = Gmail.Users.getProfile(senderEmail);

      // Try to list messages (just first one)
      const messages = Gmail.Users.Messages.list({
        userId: senderEmail,
        maxResults: 1
      });

      return {
        success: true,
        profile: {
          emailAddress: profile.emailAddress,
          messagesTotal: profile.messagesTotal,
          threadsTotal: profile.threadsTotal
        },
        canListMessages: messages.messages ? true : false,
        message: 'Gmail API connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.toString(),
        message: 'Gmail API connection failed. Check OAuth configuration and domain-wide delegation.'
      };
    }
  },

  /**
   * Send a test email to verify configuration
   * @param {string} recipient Test recipient email
   * @returns {boolean} Success status
   */
  sendTestEmail(recipient = Session.getActiveUser().getEmail()) {
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .success { color: green; font-size: 24px; }
        </style>
      </head>
      <body>
        <h1 class="success">✅ Gmail API Test Successful</h1>
        <p>This email was sent using the Gmail API from reports@sensosushi.com</p>
        <p>Timestamp: ${new Date().toLocaleString()}</p>
        <hr>
        <p><small>If you received this email, your Gmail API configuration is working correctly.</small></p>
      </body>
      </html>
    `;

    return this.sendEmail({
      recipient: recipient,
      subject: 'Gmail API Test - Senso Analytics',
      htmlBody: testHtml
    });
  }
};

/**
 * Menu function to test Gmail API
 */
function testGmailApiConnection() {
  const ui = SpreadsheetApp.getUi();
  const result = GmailService.testConnection();

  if (result.success) {
    ui.alert('✅ Gmail API Connected',
      `Connection successful!\n\n` +
      `Email: ${result.profile.emailAddress}\n` +
      `Total Messages: ${result.profile.messagesTotal}\n` +
      `Can Send: Yes`,
      ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Gmail API Error',
      `Connection failed!\n\n` +
      `Error: ${result.error}\n\n` +
      `Please check:\n` +
      `1. Gmail API is enabled in Google Cloud Console\n` +
      `2. OAuth scopes include Gmail access\n` +
      `3. Domain-wide delegation is configured`,
      ui.ButtonSet.OK);
  }
}

/**
 * Menu function to send test email via Gmail API
 */
function sendGmailApiTestEmail() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Send Test Email',
    'Enter recipient email address:',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    const recipient = result.getResponseText();

    if (recipient && recipient.includes('@')) {
      const success = GmailService.sendTestEmail(recipient);

      if (success) {
        ui.alert('✅ Test Email Sent',
          `Test email sent successfully to ${recipient}\n\n` +
          `Check your inbox for the test message from reports@sensosushi.com`,
          ui.ButtonSet.OK);
      } else {
        ui.alert('❌ Send Failed',
          'Failed to send test email. Check the logs for details.',
          ui.ButtonSet.OK);
      }
    } else {
      ui.alert('❌ Invalid Email',
        'Please enter a valid email address.',
        ui.ButtonSet.OK);
    }
  }
}