# Security Policy

## Credential Management

### CRITICAL: Never Commit Credentials

**NEVER** commit any of the following to version control, even if commented out:
- API keys (Gemini, Google Cloud, etc.)
- Service account private keys
- OAuth tokens
- Database passwords
- Any form of authentication credentials

### Secure Storage

All sensitive credentials MUST be stored using Google Apps Script's Properties Service:
```javascript
// Correct way - using SecureConfig
const apiKey = SecureConfig.getGeminiAPIKey();

// WRONG - Never hardcode credentials
const apiKey = 'AIzaSy...' // NEVER DO THIS
```

### Setting Up Credentials

1. Run `SecureConfig.initialize()` from the Apps Script editor
2. Enter credentials when prompted
3. Credentials are securely stored in Script Properties
4. Never create files like Variables.js, secrets.js, or config.secret.js

### If You Accidentally Commit Credentials

**Immediate Actions Required:**

1. **Revoke the compromised credential immediately**
   - Go to the service provider's console
   - Revoke or delete the exposed key
   - Generate a new key

2. **Remove from repository**
   ```bash
   # Delete the file
   git rm <filename>
   git commit -m "Remove exposed credential"
   ```

3. **Clean git history** (coordinate with team)
   ```bash
   # Install BFG Repo-Cleaner
   java -jar bfg.jar --delete-files <filename>

   # Or use git filter-branch
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch <filename>" \
     --prune-empty --tag-name-filter cat -- --all

   # Force push (CAUTION: This rewrites history)
   git push --force --all
   git push --force --tags
   ```

4. **Update credentials**
   - Generate new API key/credential
   - Update SecureConfig with new credential
   - Test to ensure everything works

## Security Best Practices

### Before Every Commit

1. Review changed files for credentials
2. Check for hardcoded API keys, even in comments
3. Ensure .gitignore is properly configured
4. Use `git diff` to review changes

### API Key Restrictions

Always apply restrictions to API keys:
- **IP restrictions**: Limit to known IPs when possible
- **API restrictions**: Only enable required APIs
- **Referrer restrictions**: For browser keys
- **Application restrictions**: For mobile/server keys

### Regular Security Audits

Monthly tasks:
- Review Google Cloud Console for unusual activity
- Check billing for unexpected charges
- Rotate API keys if feasible
- Review access logs

Quarterly tasks:
- Full credential rotation
- Review and update security policies
- Check for exposed credentials on GitHub

### Tools for Credential Detection

Use these tools to scan for exposed credentials:

1. **git-secrets** - Prevents committing secrets
   ```bash
   git secrets --install
   git secrets --register-aws  # or other providers
   ```

2. **truffleHog** - Scans git history for secrets
   ```bash
   trufflehog git https://github.com/your-repo
   ```

3. **GitHub Secret Scanning** - Automatic detection (for public repos)

## Incident Response

If credentials are exposed:

1. **Assess** - Determine what was exposed and potential impact
2. **Revoke** - Immediately revoke compromised credentials
3. **Replace** - Generate and deploy new credentials
4. **Review** - Check logs for any unauthorized usage
5. **Report** - Notify team and affected parties if necessary
6. **Learn** - Update processes to prevent recurrence

## Contact

For security concerns or incidents:
- Project Owner: [Your Contact]
- Security Team: [Security Contact]
- Google Cloud Support: https://cloud.google.com/support

## Additional Resources

- [Google Cloud Security Best Practices](https://cloud.google.com/security/best-practices)
- [GitHub Security Guidelines](https://docs.github.com/en/code-security)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)

---

*Last Updated: September 30, 2025*
*Version: 1.0*