// AWS Cognito Authentication Helper
// Install: npm install jsonwebtoken jwks-rsa aws-jwt-verify

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

// AWS Cognito Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
  console.warn('Warning: AWS Cognito configuration missing. Authentication will not work.');
}

// JWKS endpoint for token verification (alternative method)
const JWKS_URI = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

// Create JWKS client
const client = jwksClient({
  jwksUri: JWKS_URI,
  requestHeaders: {},
  timeout: 30000
});

// Get signing key
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Create Cognito JWT Verifiers (for both access and id tokens)
let accessTokenVerifier = null;
let idTokenVerifier = null;
if (COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID) {
  try {
    accessTokenVerifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: 'access',
      clientId: COGNITO_CLIENT_ID
    });
    idTokenVerifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: 'id',
      clientId: COGNITO_CLIENT_ID
    });
  } catch (err) {
    console.warn('Failed to create Cognito verifier:', err.message);
  }
}

/**
 * Verify JWT token with AWS Cognito (using aws-jwt-verify - recommended)
 * Tries both access and id tokens
 * @param {string} token - JWT token (access or id)
 * @returns {Promise<Object>} User information
 */
async function verifyTokenWithCognitoVerifier(token) {
  // Try ID token first (has groups info)
  if (idTokenVerifier) {
    try {
      const payload = await idTokenVerifier.verify(token);
      
      // Extract user information from token
      const groups = payload['cognito:groups'] || [];
      
      const userInfo = {
        id: payload.sub,
        username: payload.username || payload['cognito:username'] || payload.email,
        email: payload.email,
        name: payload.name || payload['cognito:username'],
        groups: groups,
        role: groups.includes('Admin') ? 'ADMIN' : 'USER',
        attributes: payload
      };

      return userInfo;
    } catch (idTokenError) {
      console.log('ID token verification failed, trying access token...');
    }
  }

  // Fallback to access token
  if (accessTokenVerifier) {
    try {
      const payload = await accessTokenVerifier.verify(token);
      
      // Extract user information from token
      const groups = payload['cognito:groups'] || [];
      
      const userInfo = {
        id: payload.sub,
        username: payload.username || payload['cognito:username'] || payload.email,
        email: payload.email,
        name: payload.name || payload['cognito:username'],
        groups: groups,
        role: groups.includes('Admin') ? 'ADMIN' : 'USER',
        attributes: payload
      };

      return userInfo;
    } catch (accessTokenError) {
      throw new Error('Invalid or expired token: ' + accessTokenError.message);
    }
  }

  throw new Error('Cognito verifier not initialized');
}

/**
 * Verify JWT token with AWS Cognito (using jwks-rsa - fallback)
 * @param {string} token - JWT access token
 * @returns {Promise<Object>} User information
 */
async function verifyTokenWithJWKS(token) {
  if (!COGNITO_USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID not configured');
  }

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
        algorithms: ['RS256']
      },
      (err, decoded) => {
        if (err) {
          reject(new Error('Invalid or expired token: ' + err.message));
          return;
        }

        // Extract user information from token
        const groups = decoded['cognito:groups'] || [];
        
        const userInfo = {
          id: decoded.sub,
          username: decoded.username || decoded['cognito:username'] || decoded.email,
          email: decoded.email,
          name: decoded.name || decoded['cognito:username'],
          groups: groups,
          role: groups.includes('Admin') ? 'ADMIN' : 'USER',
          attributes: decoded
        };

        resolve(userInfo);
      }
    );
  });
}

/**
 * Verify JWT token with AWS Cognito (tries both methods)
 * @param {string} token - JWT access token
 * @returns {Promise<Object>} User information
 */
async function verifyToken(token) {
  // Try Cognito verifier first (recommended - handles both access and id tokens)
  if (accessTokenVerifier || idTokenVerifier) {
    try {
      return await verifyTokenWithCognitoVerifier(token);
    } catch (err) {
      console.warn('Cognito verifier failed, trying JWKS:', err.message);
    }
  }

  // Fallback to JWKS
  return await verifyTokenWithJWKS(token);
}

/**
 * Middleware to authenticate requests
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No authorization header');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    console.log('🔍 Verifying token...');
    const user = await verifyToken(token);
    console.log('✅ Token verified. User:', user.email, 'Role:', user.role);
    
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return res.status(401).json({ error: 'Authentication failed: ' + error.message });
  }
}

/**
 * Middleware to check admin role
 */
async function authenticateAdmin(req, res, next) {
  try {
    await authenticate(req, res, () => {
      if (req.user.role !== 'ADMIN') {
        console.error('❌ Admin access denied. User role:', req.user.role);
        return res.status(403).json({ error: 'Admin access required' });
      }
      console.log('✅ Admin access granted');
      next();
    });
  } catch (error) {
    console.error('❌ Admin authentication failed:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = {
  authenticate,
  authenticateAdmin,
  verifyToken
};
