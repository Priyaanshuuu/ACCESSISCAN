Step 15: Add Authentication and User Accounts
Add ownership and privacy.

Add authentication
Associate scans with users
Add protected dashboard routes
Add user-owned sites
Prevent users from viewing other users’ scans
Result: The product supports real user accounts safely.

Step 16: Add Site Dashboard and Scan History
Organize repeated usage.

Add saved sites
Add scan history
Add latest score
Add score trends
Add “scan again” action
Add delete-site behavior
Result: Users can continuously monitor their websites.

Step 17: Add GitHub Action
Support the developer workflow.

Create the GitHub Action package
Accept API key and URL
Start a scan
Wait for completion
Post a pull-request comment
Optionally fail the check based on severity
Result: Developers can scan websites from CI/CD.

Step 18: Add Scheduling and Email Notifications
Support ongoing monitoring.

Add scheduled scans
Add repeatable queue jobs
Add email notifications
Notify on new or worsened issues
Add notification preferences
Result: Users no longer need to manually start every scan.

Step 19: Add Reports and Billing
Add business features after the core workflow is stable.

Generate PDF reports
Add report downloads
Add plan limits
Add usage tracking
Add Stripe billing
Add nonprofit handling
Result: The product is ready for paid usage.

Step 20: Deploy and Harden
Prepare for production.

Deploy the web app
Deploy the worker
Configure managed PostgreSQL and Redis
Add logging and error monitoring
Add backups
Test SSRF protection
Test rate limits
Add CI checks
Run production smoke tests
Result: The system is ready for real users.