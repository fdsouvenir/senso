/**
 * @OnlyCurrentDoc
 * 
 * Handles authentication for Google Cloud Platform services using a service account.
 * This ensures the script has the necessary permissions to interact with BigQuery.
 */

// --- CONFIGURATION ---
// ACTION REQUIRED: Paste the private_key from your gcp-key.json file here.
const GCP_SERVICE_ACCOUNT_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCwboykxBMZXtCE\nrdjcYJvmnj9TTJ8uFbNfH8uB8z17ky1s7QP3rPsLLXNbY2rpUx/7WPuQeJnoqCm0\nMyoMZ4QUtjb3SYQIY5sWfWIbl+ZVc4U7H0kRj7cDsxIc+VrGlSRrFmctcBcIuZJR\nS8ZOv0TgpRBRY2GF7eFJgqM38NKacfkY3Pq2vO/ee4ypuVSEYewaAf5dA5n14QdP\nEh6HhC3tcuYNVtYgwtlurRvZHj1e0a9XBsOz9ILM6C3iydNrd0Xb4+iBjz5UGPOx\njNnJ/WAYWIH5J/KyarvhVQ2wdrddTg/zFwsvVP70K9TgvU9n8ihGyYsgXJP0ahK3\ncUztRE+HAgMBAAECggEAKjZI8CL5btiAiz4M5K04n7S88fEjJKOMhvXUewL3ctmD\nxMvwZxG7/rChKPxgV/LLdBeWGLrCGCgj0jlrlgwuTcZK4F92d4tdT8Qv9Ooi8c7x\n0XNqyAjagMgXTVdboKeOTxDNHtHysOO1Xj4C9FRO5nCXtuFQM/r2K+BVrMyxlsHI\nZCK+uLWODFygX+c+cO5kElNbD2BEPyEia74YZtNAUvb0H97f95SSJ+AeTrFUJBo0\n5T6zzPADoDTLbKiTTxiekhS2UDmgc8HzZDldhnYD4rOFIUzzLEvMOwMQ/gek63zt\nLmHb7nUlqrLe+SqBj6Y+h/gyscEh51C/c3rMTZAcAQKBgQDWc8l086Yo6/pAs9ff\n+mMcC5Cux3yEgFd5iseOHgmS6bcrvvAxOZLOeSEZ8eOmX8fADpb21P8ofGIKdIjj\nv8XJ4LGggHP8Y3ShMTqhuSiLaodm3iz4FXI1HVTLPpYdWaJuZuLXuH97gaJOHkRs\nReuegr8Gy/lZPUGdqzVKEI9IaQKBgQDSnQ7GGPZGZL9CnPCiHq8OvRSebeXZYynr\nmOtpJeSLwxeQIz/8TtHX0TMXFPL30mV6Q2oquMHh4u719DJO5HILeuGv5ByNegG5\nUqjqvwKjKkzMZer4ojZMI+HC8wrfMAxnXwcaHsilaLuGCmpYQcR6YfjXPI2/zVGe\nxlH1JFdabwKBgDcMe984mCOTB6dKQxTsmjpdwaML9CuzIkFB3Z3emgiLVAi3t8J7\nC/NSZqvZSt2vYoArfpcX7/O9khEq/uSvmp8Kva38q0lTYmHqWCmhdQXsr5s5VwPL\nxYha4iRWCYS5OJfsczh61MaobThuTpQYkrYay9x7yaMdtVU62LANdipZAoGAEUlI\nxCOaWw67z/jXm0bPcXM9dP9qJRyJfUfQ0pGEn6AEmBT8lHXXrVIDUnqqsoJ3R8Cu\nvxDpAORCXreLRYRkg+KzEV+0pDwGVjKdoJ7K1Z+MLB6VWZDeygML7ZdLJiRocDeR\neqhaKZFeCtNiBRpoyO6voOLcc4ijkVePtIImFUsCgYAEwhbpBQWzC7uXaLRReY1O\nrX/UyDyln+tj7TW1jiimIh3h6rusmYWLoPk9qd9FPrwfgtwXFOyncOPAr+TKIAI5\nIxUG9z2SLpg3Qt/+ijfRTnqoxkZMjLMYKYZ1H9B60bwQpgHUIAXKxfpGQguh6utu\nzzHm+bRiqFNEj2jdNXMG3w==\n-----END PRIVATE KEY-----\n';
const GCP_SERVICE_ACCOUNT_EMAIL = 'apps-script-bigquery-etl@senso-473622.iam.gserviceaccount.com';
// --------------------


/**
 * Creates and returns an authorized service for interacting with the BigQuery API.
 * Caches the service object for the duration of the script execution.
 * @returns {object} An authorized BigQuery service object.
 */
function getBigQueryService() {
  // Caching the service object for efficiency during a single script run.
  if (this.service) {
    return this.service;
  }

  // Use the OAuth2 for Apps Script library to create a service account flow.
  const service = OAuth2.createServiceAccountFlow({
    privateKey: GCP_SERVICE_ACCOUNT_KEY,
    clientEmail: GCP_SERVICE_ACCOUNT_EMAIL,
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  });
  
  this.service = service;
  return this.service;
}