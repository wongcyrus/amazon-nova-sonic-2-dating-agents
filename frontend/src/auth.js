// Simple client-side Cognito authentication without AWS SDK

// Global config reference
let config = null;

async function loadConfig() {
    if (config) return config;
    try {
        const response = await fetch('/config.json');
        if (!response.ok) throw new Error('Failed to load config.json');
        config = await response.json();
        // Persist parameters for general app use
        localStorage.setItem('awsRegion', config.region);
        localStorage.setItem('cognitoUserPoolId', config.userPoolId);
        localStorage.setItem('cognitoClientId', config.clientId);
        localStorage.setItem('cognitoIdentityPoolId', config.identityPoolId);
        localStorage.setItem('agentCoreRuntimeArn', config.runtimeArn);
        return config;
    } catch (err) {
        console.error('Error loading configuration:', err);
        showError('Application configuration failed to load.');
        return null;
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

// Hide error message
function hideError() {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// Show loading state
function showLoading(show = true) {
    const loadingDiv = document.getElementById('loading');
    const loginButton = document.getElementById('login-button');

    if (show) {
        if (loadingDiv) loadingDiv.style.display = 'block';
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
        }
    } else {
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    }
}

// Authenticate user via public Cognito Identity Provider REST API
async function authenticateUser(username, password) {
    const appConfig = await loadConfig();
    if (!appConfig) throw new Error('Configuration not loaded');

    const region = appConfig.region;
    const clientId = appConfig.clientId;

    const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
        },
        body: JSON.stringify({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Authentication failed');
    }

    const result = await response.json();
    const authResult = result.AuthenticationResult;

    // Store tokens in localStorage
    localStorage.setItem('accessToken', authResult.AccessToken);
    localStorage.setItem('idToken', authResult.IdToken);
    localStorage.setItem('refreshToken', authResult.RefreshToken);

    return authResult;
}

// Check if user is already authenticated
function checkExistingAuth() {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);

            if (payload.exp > currentTime) {
                // Token is still valid, redirect to main app
                window.location.href = '/';
                return true;
            } else {
                localStorage.clear();
            }
        } catch (error) {
            localStorage.clear();
        }
    }
    return false;
}

// Handle form submission
async function handleLogin(event) {
    event.preventDefault();

    hideError();
    showLoading(true);

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        await authenticateUser(username, password);
        window.location.href = '/';
    } catch (error) {
        showLoading(false);
        let errorMessage = 'Login failed. Please try again.';

        if (error.message.includes('NotAuthorizedException')) {
            errorMessage = 'Invalid username or password.';
        } else if (error.message.includes('UserNotConfirmedException')) {
            errorMessage = 'Please confirm your account before logging in.';
        } else if (error.message.includes('PasswordResetRequiredException')) {
            errorMessage = 'Password reset required.';
        } else if (error.message.includes('UserNotFoundException')) {
            errorMessage = 'User not found.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        showError(errorMessage);
    }
}

// Initialize the page
async function initializePage() {
    await loadConfig();
    if (checkExistingAuth()) {
        return;
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}

// Start when page is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
} else {
    initializePage();
}