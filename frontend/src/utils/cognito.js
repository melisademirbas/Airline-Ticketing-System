// AWS Cognito Configuration
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

// Try to get from environment variables, fallback to hardcoded values for testing
const region = process.env.REACT_APP_AWS_REGION || 'eu-north-1';
const userPoolId = process.env.REACT_APP_COGNITO_USER_POOL_ID || 'eu-north-1_0IKa8ySfx';
const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID || 'ahjf8dv8thoaasmg65gkenbtt';
const domain = process.env.REACT_APP_COGNITO_DOMAIN || 'eu-north-10ika8ysfx.auth.eu-north-1.amazoncognito.com';

console.log('🔍 Cognito Config Check:', {
  region,
  userPoolId,
  clientId,
  domain,
  hasUserPoolId: !!userPoolId,
  hasClientId: !!clientId
});

if (!userPoolId || !clientId) {
  console.error('❌ ERROR: AWS Cognito configuration missing!');
  console.error('Required environment variables:');
  console.error('  REACT_APP_COGNITO_USER_POOL_ID:', userPoolId || 'MISSING');
  console.error('  REACT_APP_COGNITO_CLIENT_ID:', clientId || 'MISSING');
  throw new Error('AWS Cognito configuration missing. Please check .env file.');
}

// Create User Pool
const poolData = {
  UserPoolId: userPoolId,
  ClientId: clientId
};

export const userPool = new CognitoUserPool(poolData);

// Get current user
export function getCurrentUser() {
  return userPool.getCurrentUser();
}

// Sign in
export function signIn(username, password) {
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (result) => {
        const accessToken = result.getAccessToken().getJwtToken();
        const idToken = result.getIdToken().getJwtToken();
        
        // Decode ID token to get user info
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        
        resolve({
          accessToken,
          idToken,
          user: {
            email: payload.email,
            name: payload.name || payload['cognito:username'],
            sub: payload.sub,
            groups: payload['cognito:groups'] || []
          }
        });
      },
      onFailure: (err) => {
        reject(err);
      },
      newPasswordRequired: (userAttributes, requiredAttributes) => {
        // Return special flag for new password required
        reject({
          code: 'NewPasswordRequired',
          message: 'New password required. Please set a new password.',
          userAttributes: userAttributes,
          requiredAttributes: requiredAttributes,
          cognitoUser: cognitoUser
        });
      }
    });
  });
}

// Sign out
export function signOut() {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
  localStorage.clear();
}

// Get session (for checking if user is logged in)
export function getSession() {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      reject(new Error('No user found'));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }
      if (!session.isValid()) {
        reject(new Error('Session is not valid'));
        return;
      }
      resolve(session);
    });
  });
}

// Get access token
export function getAccessToken() {
  return new Promise((resolve, reject) => {
    getSession()
      .then(session => {
        const accessToken = session.getAccessToken().getJwtToken();
        resolve(accessToken);
      })
      .catch(reject);
  });
}

// Get ID token (contains user info)
export function getIdToken() {
  return new Promise((resolve, reject) => {
    getSession()
      .then(session => {
        const idToken = session.getIdToken().getJwtToken();
        resolve(idToken);
      })
      .catch(reject);
  });
}

// Get user info from token
export function getUserInfo() {
  return new Promise((resolve, reject) => {
    getIdToken()
      .then(idToken => {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        resolve({
          email: payload.email,
          name: payload.name || payload['cognito:username'],
          sub: payload.sub,
          groups: payload['cognito:groups'] || []
        });
      })
      .catch(reject);
  });
}

// OAuth Login (Hosted UI)
export function getOAuthLoginUrl() {
  // Use hardcoded redirect URI to match AWS Cognito settings
  const redirectUri = encodeURIComponent('http://localhost:3000');
  const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID || 'ahjf8dv8thoaasmg65gkenbtt';
  const domain = process.env.REACT_APP_COGNITO_DOMAIN || 'eu-north-10ika8ysfx.auth.eu-north-1.amazoncognito.com';
  
  console.log('🔗 OAuth Login URL:', {
    domain,
    clientId,
    redirectUri: 'http://localhost:3000'
  });
  
  return `https://${domain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`;
}

// Handle OAuth callback
export function handleOAuthCallback() {
  return new Promise((resolve, reject) => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      reject(new Error(error));
      return;
    }

    if (!code) {
      reject(new Error('No authorization code found'));
      return;
    }

    // Exchange code for tokens
    const redirectUri = 'http://localhost:3000'; // Must match the redirect_uri used in authorization
    const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID || 'ahjf8dv8thoaasmg65gkenbtt';
    const domain = process.env.REACT_APP_COGNITO_DOMAIN || 'eu-north-10ika8ysfx.auth.eu-north-1.amazoncognito.com';
    
    const tokenUrl = `https://${domain}/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri
    });

    fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        reject(new Error(data.error));
        return;
      }

      const idToken = data.id_token;
      const accessToken = data.access_token;
      
      // Decode ID token
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      
      resolve({
        accessToken,
        idToken,
        user: {
          email: payload.email,
          name: payload.name || payload['cognito:username'],
          sub: payload.sub,
          groups: payload['cognito:groups'] || []
        }
      });
    })
    .catch(reject);
  });
}
