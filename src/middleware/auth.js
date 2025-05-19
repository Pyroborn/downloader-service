const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
// Don't call dotenv.config() here as it should be initialized only once at the application root

const authMiddleware = (req, res, next) => {
    let token;
    
    // Check for token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    
    // If token not found in header, check URL query parameter
    if (!token && req.query.token) {
        token = req.query.token;
    }
    
    // If no token provided, return unauthorized
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
        // Debug token details (safely)
        console.log('----- TOKEN DEBUG INFO -----');
        console.log('Token first 10 chars:', token.substring(0, 10) + '...');
        console.log('Using JWT_SECRET:', jwtConfig.JWT_SECRET.substring(0, 5) + '...');
        console.log('JWT_SECRET length:', jwtConfig.JWT_SECRET.length);
        
        // Try to decode without verification to see payload
        const decodedNoVerify = jwtConfig.decodeToken(token);
        if (decodedNoVerify) {
            console.log('Token payload (without verification):', decodedNoVerify);
        } else {
            console.log('Could not decode token payload (malformed token)');
        }
        
        // Verify token with JWT_SECRET
        const decoded = jwt.verify(token, jwtConfig.JWT_SECRET);
        console.log('Token successfully verified!');
        
        // Extract user ID from token, checking different possible properties
        const userId = decoded.userId || decoded.id || decoded.sub;
        
        if (!userId) {
            console.warn('No user ID found in token!', decoded);
            return res.status(401).json({ 
                error: 'Invalid token: missing user identifier'
            });
        }
        
        // Add user info to request - ensuring all possible field mappings
        req.user = {
            // Ensure both userId and id are set with the same value
            userId: userId,
            id: userId,
            // Other properties
            role: decoded.role || 'user',
            name: decoded.name,
            email: decoded.email
        };
        
        console.log('User set in request:', req.user);
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        console.error('Error type:', error.name);
        
        return res.status(401).json({ 
            error: 'Invalid token: ' + error.message
        });
    }
};

module.exports = authMiddleware; 