const fs = require('fs');
const path = require('path');
const os = require('os');
const { askApproval } = require('../router/askApproval.js');

class AuthManager {
    constructor() {
        this.tokenFilePath = path.join(os.homedir(), '.cli_runner_auth.json');
        this.clientId = 'cli-runner-dummy-client-id'; // Mock clientId for Codex provider (e.g. GitHub/Azure)
    }

    /**
     * Retrieves the current active credential. 
     * Precedence:
     * 1. Environment Variable CODEX_API_KEY (for advanced/API users)
     * 2. Stored OAuth Token
     * 3. Run Device Flow to get a new OAuth Token
     */
    async getCredential() {
        // Priority 1: Check environment variable API Key
        if (process.env.CODEX_API_KEY) {
            console.log('🔑 [Auth] Using CODEX_API_KEY from environment.');
            return { type: 'api_key', value: process.env.CODEX_API_KEY };
        }

        // Priority 2: Check locally stored OAuth token
        let storedAuth = this._loadStoredToken();
        if (storedAuth && this._isTokenValid(storedAuth)) {
            console.log('🔑 [Auth] Using cached OAuth token.');
            return { type: 'oauth', value: storedAuth.access_token };
        }

        // Priority 3: No valid auth found. Initiate Device Flow for general users.
        console.log('⚠️ [Auth] No valid authentication found. Starting secure browser login...');
        const newToken = await this._performDeviceFlow();
        this._saveToken(newToken);
        return { type: 'oauth', value: newToken.access_token };
    }

    _loadStoredToken() {
        try {
            if (fs.existsSync(this.tokenFilePath)) {
                const data = fs.readFileSync(this.tokenFilePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error('[Auth] Failed to load stored token:', err.message);
        }
        return null;
    }

    _saveToken(tokenObj) {
        try {
            fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokenObj, null, 2), { mode: 0o600 });
            console.log('[Auth] Token securely saved to local storage.');
        } catch (err) {
            console.error('[Auth] Failed to save token:', err.message);
        }
    }

    _isTokenValid(tokenObj) {
        if (!tokenObj || !tokenObj.access_token || !tokenObj.expires_at) return false;
        // Check if it expires in the next 5 minutes
        if (Date.now() > tokenObj.expires_at - 300000) return false;
        return true;
    }

    /**
     * Simulates an OAuth Device Authorization Flow.
     * Prompts the user to go to a URL and enter a code, then polls for completion.
     */
    async _performDeviceFlow() {
        // 1. Request device code (Mocking HTTP request to Identity Provider)
        const deviceCode = "mock_" + Date.now();
        const userCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const verificationUri = "https://cli-runner.auth.com/activate";
        const expiresIn = 900; // 15 mins

        console.log('\n======================================================');
        console.log(`🚀 Action Required: Please authenticate CLI_Runner`);
        console.log(`1. Open this URL in your browser: ${verificationUri}`);
        console.log(`2. Enter the following code:       ${userCode}`);
        console.log('======================================================\n');

        // 2. Poll for the token (Mocking the polling logic)
        process.stdout.write('Waiting for authorization (Polling)... ');

        // Using our HITL askApproval purely as a physical pause/mock for this simulation
        // In reality, this would be a while loop making HTTP requests every 5 seconds
        const simulatedAuth = await askApproval(`[SIMULATION] Did you authorize in the browser?`);

        if (simulatedAuth) {
            console.log('\n✅ [Auth] Successfully authenticated!');
            return {
                access_token: "oauth_token_codex_" + Date.now(),
                token_type: "bearer",
                expires_at: Date.now() + (3600 * 1000) // 1 Hour mock expiry
            };
        } else {
            console.log('\n❌ [Auth] Authorization failed or timed out.');
            throw new Error('Device authorization failed or was rejected by user');
        }
    }
}

module.exports = AuthManager;
